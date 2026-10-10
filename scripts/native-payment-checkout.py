#!/usr/bin/env python3
"""Run current-input EPay checkout HTTP and durable-artifact verification.

Requires a built gateway and PostgreSQL tools on PATH. Creates its own cluster,
identity and merchant secret. Never contacts a payment service or submits a paid
notification. This verifies local checkout capability, not merchant settlement.
"""
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
    parser.add_argument('--gateway', type=Path, default=Path('target/release/niu-gateway'))
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
        server = None
        logs = []

        def request(method, path, body=None):
            req = urllib.request.Request(f'http://127.0.0.1:{httpport}{path}', method=method,
                data=None if body is None else json.dumps(body).encode(),
                headers={'Authorization': f'Bearer {admin}', 'Content-Type': 'application/json'})
            try:
                with client.open(req, timeout=30) as response:
                    return response.status, response.read()
            except urllib.error.HTTPError as error:
                return error.code, error.read()

        def api(method, path, body=None):
            status, raw = request(method, path, body)
            require(200 <= status < 300, f'{method} {path}: unexpected HTTP {status}')
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
            start()
            path = '/admin/v1/platform/payments/epay'
            settings = dict(expected_revision='0', enabled=True, merchant_id='123456', key=merchant_key,
                endpoint='https://checkout.example.com/submit.php',
                notify_url='https://niu.example.com/payments/epay/notify',
                return_url='https://niu.example.com/settings/payments', methods=['alipay', 'wxpay'])
            require(request('PUT', path, dict(settings, enabled=False, methods=['invalid']))[0] == 400,
                'Unsupported disabled payment method was accepted')
            require(sql('SELECT count(*) FROM payment_gateway_configuration') == '0',
                'Rejected configuration persisted')
            saved = api('PUT', path, settings)['data']
            require(saved['has_key'] and 'key' not in saved, 'Merchant secret response boundary failed')
            org = api('POST', '/admin/v1/organizations', {'name': 'Current checkout verification', 'currency': 'CNY'})
            base = f'/admin/v1/organizations/{org["id"]}/billing/topups'
            intent = dict(payment_gateway='epay', currency='CNY', amount_nanos='12340000000',
                payment_method='alipay', idempotency_key=str(uuid.uuid4()))
            barrier = threading.Barrier(8)

            def create_concurrently(_):
                barrier.wait(timeout=10)
                return api('POST', base, intent)['data']

            with ThreadPoolExecutor(max_workers=8) as workers:
                orders = list(workers.map(create_concurrently, range(8)))
            order = orders[0]
            require(all(item == order for item in orders), 'Concurrent identical intents diverged')
            require(order['status'] == 'pending' and order['amount_nanos'] == intent['amount_nanos'],
                'Checkout did not preserve pending intent')
            url = urllib.parse.urlsplit(order['checkout_url'])
            fields = dict(urllib.parse.parse_qsl(url.query))
            require(url.hostname == 'checkout.example.com' and fields['money'] == '12.34'
                and fields['type'] == 'alipay' and fields['pid'] == settings['merchant_id']
                and fields['out_trade_no'] == uuid.UUID(order['id']).hex, 'Checkout parameters differ from intent')
            signed = '&'.join(k + '=' + v for k, v in sorted(fields.items())
                if k not in ('sign', 'sign_type') and v) + merchant_key
            require(hashlib.md5(signed.encode()).hexdigest() == fields['sign']
                and fields['sign_type'] == 'MD5' and merchant_key not in order['checkout_url'],
                'Independent checkout signature verification failed')
            require(api('POST', base, intent)['data'] == order, 'Idempotent replay changed checkout')
            require(request('POST', base, dict(intent, amount_nanos='12350000000'))[0] == 409,
                'Conflicting intent was accepted')
            require(request('PUT', path, dict(settings, expected_revision=saved['revision'],
                enabled=False, key=''))[0] == 409, 'Pending order allowed incompatible configuration change')
            require(api('GET', path)['data'] == saved, 'Rejected change altered merchant configuration')
            stop_process(server)
            start()
            require(api('GET', base + '/' + order['id'])['data'] == order, 'Restart lost pending checkout')
            require(api('POST', base, intent)['data'] == order, 'Restart changed idempotent replay')
            counts = sql('SELECT (SELECT count(*) FROM customer_topup_orders), '
                '(SELECT count(*) FROM customer_topup_settlements), '
                '(SELECT count(*) FROM customer_balance_entries)')
            require(counts == '1|0|0', 'Checkout duplicated an order or incorrectly credited funds')
            print('Verified current HTTP checkout, independent signature, restart/replay, and database artifacts.')
            print('One pending order; no settlements or balance entries. External payment remains unverified.')
        finally:
            stop_process(server)
            try:
                if data.exists():
                    stop_postgres(data)
            finally:
                for log in logs:
                    log.close()


if __name__ == '__main__':
    main()
