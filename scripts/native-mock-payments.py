#!/usr/bin/env python3
"""Exercise the mock merchant through real isolated gateway checkout and ledger paths."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from native_cleanup import stop_postgres, stop_process


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def free_port():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        return listener.getsockname()[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gateway', type=Path, default=Path('target/debug/niu-gateway'))
    parser.add_argument('--hold', action='store_true', help='Keep an isolated dashboard and checkout running for twenty minutes after verification')
    args = parser.parse_args()
    gateway_binary = args.gateway.resolve()
    require(gateway_binary.is_file(), 'Build the gateway before running this command')
    for tool in ('initdb', 'pg_ctl', 'psql'):
        require(shutil.which(tool), f'{tool} must be on PATH')
    with tempfile.TemporaryDirectory(prefix='niu-checkout-') as directory:
        root = Path(directory)
        root.chmod(0o700)
        data = root / 'postgres'
        pgport, httpport = free_port(), free_port()
        while pgport == httpport:
            httpport = free_port()
        password, admin, encryption, merchant_key = [secrets.token_hex(32) for _ in range(4)]
        password_file = root / 'password'
        password_file.write_text(password)
        password_file.chmod(0o600)
        config = root / 'niu.toml'
        config.write_text('[server]\nrequest_timeout_seconds = 60\n')
        environment = {k: os.environ[k] for k in ('PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL') if k in os.environ}
        environment.update(PGPASSWORD=password, NIU_ADMIN_TOKENS=admin,
            NIU_VENDOR_ENCRYPTION_KEY=encryption, NIU_CONFIG_FILE=str(config),
            NIU_BIND=f'127.0.0.1:{httpport}', NIU_VIDEO_POLLING='false', RUST_LOG='warn',
            NIU_DATABASE_URL=f'postgres://niu_verify:{password}@127.0.0.1:{pgport}/postgres')
        client = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        mockport = free_port()
        mockkey, mocksecret = 'sk_test_'+secrets.token_hex(24), 'whsec_'+secrets.token_hex(24)
        environment.update(NIU_ENVIRONMENT='test', NIU_MOCK_PAYMENT_URL=f'http://127.0.0.1:{mockport}/', NIU_MOCK_PAYMENT_KEY=mockkey, NIU_MOCK_PAYMENT_SECRET=mocksecret, NIU_PAYMENT_POLLING='false')
        mock = None
        server = None
        dashboard = None
        dashboard_port = free_port() if args.hold else httpport
        return_url = f'http://127.0.0.1:{dashboard_port}/settings/payments'
        if args.hold:
            environment.update(NIU_DEV_MEMBER_ORIGIN=f'http://127.0.0.1:{dashboard_port}',
                NIU_DEV_USERNAME='demo@niu.io', NIU_DEV_PASSWORD=secrets.token_hex(24))
            browser_password = root / 'browser-password'
            browser_password.write_text(environment['NIU_DEV_PASSWORD'])
            browser_password.chmod(0o600)
        logs = []

        def request(method, path, body=None, token=None):
            req = urllib.request.Request(f'http://127.0.0.1:{httpport}{path}', method=method,
                data=None if body is None else json.dumps(body).encode(),
                headers={'Authorization': 'Bearer ' + (token or admin), 'Content-Type': 'application/json'})
            try:
                with client.open(req, timeout=30) as response:
                    return response.status, response.read()
            except urllib.error.HTTPError as error:
                return error.code, error.read()

        def api(method, path, body=None):
            status, raw = request(method, path, body)
            require(200 <= status < 300, f'{method} {path}: unexpected HTTP {status}: {raw.decode()[:500]}')
            return json.loads(raw)

        def sql(statement):
            return subprocess.check_output(['psql', '-h', '127.0.0.1', '-p', str(pgport),
                '-U', 'niu_verify', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement],
                env=environment, text=True, stderr=subprocess.DEVNULL).strip()

        def start():
            nonlocal server
            log = (root / 'gateway.log').open('ab')
            logs.append(log)
            server = subprocess.Popen([str(gateway_binary)], cwd=root, env=environment,
                stdout=log, stderr=log)
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                require(server.poll() is None, 'Isolated gateway exited before readiness')
                try:
                    if request('GET', '/readyz')[0] == 200:
                        return
                except (OSError, urllib.error.URLError):
                    pass
                time.sleep(.1)
            raise RuntimeError('Isolated gateway readiness timeout')

        try:
            subprocess.run(['initdb', '-D', str(data), '-U', 'niu_verify', '--auth=scram-sha-256',
                '--pwfile', str(password_file), '--no-locale', '--encoding=UTF8'], env=environment,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            subprocess.run(['pg_ctl', '-D', str(data), '-l', str(root / 'postgres.log'), '-o',
                f'-h 127.0.0.1 -p {pgport} -k {root}', '-w', 'start'], env=environment,
                stdout=subprocess.DEVNULL, check=True)
            mocklog=(root/'mock.log').open('ab'); logs.append(mocklog)
            mock_command = ['python3',str(Path(__file__).resolve().parents[1]/'tools/mock-payments/service.py'),'--port',str(mockport),'--state',str(root/'mock'),'--callback',f'http://127.0.0.1:{httpport}/payments/stripe/notify','--return-url',return_url]
            mock=subprocess.Popen(mock_command,env=environment,stdout=mocklog,stderr=mocklog)
            start()
            import base64
            import hmac
            def merchant(method, path, body=None):
                req=urllib.request.Request(f'http://127.0.0.1:{mockport}'+path, method=method,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json','Authorization':'Basic '+base64.b64encode((mockkey+':').encode()).decode()})
                with client.open(req, timeout=5) as response: return json.loads(response.read())
            def expect_workspace_gate(ready):
                require(api('GET','/api/v1/payments/readiness')['data']['ready'] is ready,
                    'Payment prerequisite disagrees with merchant state')
                status, _ = request('GET','/api/v1/workspaces')
                require(status == (200 if ready else 503),
                    'Workspace entry did not follow the payment prerequisite')
            expect_workspace_gate(False)
            api('PUT','/api/v1/platform/currency',{'currency':'USD'})
            require(api('GET','/api/v1/platform/payments/mock')['data']['available'], 'Mock configuration not available')
            status, _ = request('PUT', '/api/v1/platform/payments/mock', {'enabled':True}, token='unauthorized')
            require(status in (401,403), 'Mock configuration accepted unauthorized caller')
            api('PUT','/api/v1/platform/payments/mock',{'enabled':False})
            require(not api('GET','/api/v1/payments/environment')['data']['mock_payments'], 'Disabled mode was not reported')
            expect_workspace_gate(False)
            api('PUT','/api/v1/platform/payments/mock',{'enabled':True})
            require(api('GET','/api/v1/payments/environment')['data']['mock_payments'], 'Enabled mode was not reported')
            expect_workspace_gate(True)
            org=api('POST','/admin/v1/organizations',{'name':'Mock payment test','currency':'USD'})
            api('PUT','/api/v1/platform/payments/mock',{'enabled':False})
            methods=api('GET',f'/api/v1/organizations/{org["id"]}/billing/payment-methods?currency=USD&payment_gateway=stripe')['data']
            require(not methods['available'] and methods['unavailable_reason']=='integration_unavailable', 'Disabled mock reported a missing currency account or available checkout')
            integrations=api('GET','/api/v1/platform/payments/integrations')['data']
            require(not next(item for item in integrations if item['id']=='stripe')['checkout_enabled'], 'Disabled mock advertised enabled checkout')
            api('PUT','/api/v1/platform/payments/mock',{'enabled':True})
            base=f'/admin/v1/organizations/{org["id"]}/billing/topups'
            expected=0
            def balance():
                return int(sql("SELECT COALESCE(sum(amount_nanos),0) FROM customer_balance_entries WHERE organization_id='"+org['id']+"'"))
            for scenario in ('success','duplicate','out_of_order','failure','cancel','timeout','delayed'):
                intent=dict(payment_gateway='stripe',currency='USD',amount_nanos='12340000000',payment_method='card',idempotency_key=str(uuid.uuid4()))
                order=api('POST',base,intent)['data']
                require(order['status']=='pending','Checkout credited prematurely')
                expect_workspace_gate(True)
                require(balance()==expected,'Creating checkout altered balance')
                require(api('POST',base,intent)['data']==order,'Idempotent checkout changed')
                token=order['checkout_url'].rsplit('/',1)[-1]
                if scenario=='success':
                    session=sql("SELECT platform_reference FROM customer_topup_provider_orders WHERE order_id='"+order['id']+"'")
                    saved=merchant('GET','/v1/checkout/sessions/'+session)
                    def notification(body, signed=True):
                        raw=json.dumps(body).encode(); timestamp=str(int(time.time()))
                        digest=hmac.new(mocksecret.encode(),timestamp.encode()+b'.'+raw,hashlib.sha256).hexdigest() if signed else '0'*64
                        req=urllib.request.Request(f'http://127.0.0.1:{httpport}/payments/stripe/notify',data=raw,headers={'Content-Type':'application/json','Stripe-Signature':f't={timestamp},v1={digest}'})
                        try:
                            with client.open(req,timeout=10) as response: return response.status
                        except urllib.error.HTTPError as error: return error.code
                    paid_session=dict(saved,status='complete',payment_status='paid')
                    event=dict(id='evt_mock_invalid',object='event',type='checkout.session.completed',livemode=False,data=dict(object=paid_session))
                    require(notification(event,False)==400,'Forged signature accepted')
                    for field,value in [('amount_total',1235),('currency','cny'),('id','cs_test_wrong'),('livemode',True)]:
                        bad=dict(event,data=dict(object=dict(paid_session,**{field:value})))
                        require(notification(bad)==400,'Mismatched '+field+' accepted')
                    require(balance()==expected,'Rejected evidence credited funds')
                merchant('POST','/api/checkouts/'+token,{'outcome':scenario})
                if scenario=='delayed':
                    require(balance()==expected,'Delayed callback credited before delivery')
                    # Restart both sides while the signed notification is queued.
                    stop_process(server); stop_process(mock)
                    mock=subprocess.Popen(mock_command,env=environment,stdout=mocklog,stderr=mocklog)
                    start()
                paid=scenario in ('success','duplicate','out_of_order','delayed')
                if paid: expected+=12340000000
                deadline=time.monotonic()+25
                while paid and balance()!=expected and time.monotonic()<deadline: time.sleep(.2)
                time.sleep(1.3)  # Allow duplicate/stale deliveries, not just the first event.
                require(balance()==expected,scenario+': wrong ledger credit')
                if not paid:
                    deadline=time.monotonic()+8
                    while True:
                        code,raw=request('POST',base+'/'+order['id']+'/reconcile')
                        if code==200: break
                        require(code==502 and time.monotonic()<deadline,'Merchant reconciliation failed: '+raw.decode()[:300])
                        time.sleep(1)
                expect_workspace_gate(True)
                detail=api('GET',base+'/'+order['id'])['data']
                require((detail['status']=='paid')==paid,scenario+': incorrect durable order status')
                # The separate administrator reconciliation exercises authenticated merchant queries.
                if scenario in ('failure','cancel'): require(detail['status']=='closed','Unpaid expired order not closed')
                if scenario=='timeout': require(detail['status']=='pending','Unconfirmed order did not stay pending')
                require(merchant('POST','/api/checkouts/'+token,{'outcome':scenario})['outcome']==scenario,'Scenario replay changed')
            require(sql('SELECT count(*) FROM customer_topup_settlements')=='4','Settlement count is not exactly once')
            merchant('POST','/control',{'readiness':'unavailable'})
            expect_workspace_gate(False)
            status,_=request('POST',base,dict(intent,idempotency_key=str(uuid.uuid4())))
            require(status==502,'Unavailable merchant produced a checkout')
            require(balance()==expected,'Unavailable merchant credited funds')
            merchant('POST','/control',{'readiness':'unconfigured'})
            expect_workspace_gate(False)
            merchant('POST','/control',{'readiness':'ready'})
            expect_workspace_gate(True)
            preview=api('POST',base,dict(intent,idempotency_key=str(uuid.uuid4())))['data']
            print('Verified: real checkout, signatures, exact-once ledger, failed/cancelled/timeout safety, duplicate/stale/delayed events, restart and unavailable merchant.',flush=True)
            print('Isolated test checkout: '+preview['checkout_url'],flush=True)
            if args.hold:
                api('PUT','/api/v1/platform/payments/mock',{'enabled':False})
                dashboard_env = dict(environment, NIU_DEV_GATEWAY_URL=f'http://127.0.0.1:{httpport}',
                    VITE_NIU_GATEWAY_LOGIN='1', VITE_NIU_MOCK_PAYMENTS='1')
                dashboard_log = (root / 'dashboard.log').open('ab'); logs.append(dashboard_log)
                dashboard = subprocess.Popen(['pnpm','exec','vite','--strictPort','--host','127.0.0.1','--port',str(dashboard_port)],
                    cwd=Path(__file__).resolve().parents[1]/'apps/dashboard',env=dashboard_env,stdout=dashboard_log,stderr=dashboard_log)
                print('Isolated dashboard: '+return_url, flush=True)
                print('Test login: demo@niu.io; private password file: '+str(browser_password),flush=True)
                time.sleep(1200)
        finally:
            stop_process(dashboard)
            stop_process(server)
            stop_process(mock)
            try:
                if data.exists(): stop_postgres(data)
            finally:
                for log in logs: log.close()

if __name__=='__main__':
    try: main()
    except KeyboardInterrupt: pass
