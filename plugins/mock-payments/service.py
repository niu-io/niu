#!/usr/bin/env python3
"""Opt-in simulated payment plugin. Uses signed Stripe-shaped notifications, never Niu SQL."""
import argparse
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def loopback_url(value):
    u = urlsplit(value)
    if u.scheme != 'http' or u.hostname != '127.0.0.1' or not u.port or u.username or u.password or u.fragment:
        raise ValueError('Use an explicit http://127.0.0.1:port URL')
    return value


class Merchant:
    def __init__(self, db, origin, callback, return_url, key, secret, enabled=True, database_url=None):
        self.origin, self.callback, self.return_url = origin, callback, return_url
        self.key, self.secret = key, secret
        self.lock = threading.RLock()
        if database_url:
            from storage import Postgres
            self.db = Postgres(database_url)
        else:
            self.db = sqlite3.connect(db, check_same_thread=False)
            self.db.row_factory = sqlite3.Row
        self.db.executescript('''
          PRAGMA journal_mode=WAL;
          CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
          INSERT OR IGNORE INTO settings VALUES('readiness','ready');
          CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, idem TEXT UNIQUE NOT NULL, request TEXT NOT NULL, body TEXT NOT NULL, outcome TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS deliveries(id INTEGER PRIMARY KEY, session TEXT NOT NULL, event TEXT NOT NULL, due REAL NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, delivered INTEGER NOT NULL DEFAULT 0, last_status INTEGER);
          CREATE TABLE IF NOT EXISTS attempts(delivery INTEGER NOT NULL, sent REAL NOT NULL, status INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS retries(original INTEGER PRIMARY KEY, replacement INTEGER NOT NULL);
        ''')
        self.db.execute("INSERT OR IGNORE INTO settings VALUES('enabled',?)", ('true' if enabled else 'false',))
        self.db.commit()

    def enabled(self):
        return self.db.execute("SELECT value FROM settings WHERE key='enabled'").fetchone()["value"] == 'true'

    def readiness(self):
        if not self.enabled(): return 'unconfigured'
        return self.db.execute("SELECT value FROM settings WHERE key='readiness'").fetchone()["value"]

    def create(self, form, idem):
        def single(name):
            values = form.get(name, [])
            if len(values) != 1: raise ValueError('Missing or duplicate checkout field')
            return values[0]
        reference = single('client_reference_id')
        amount = int(single('line_items[0][price_data][unit_amount]'))
        currency = single('line_items[0][price_data][currency]')
        if len(reference) != 32 or any(c not in '0123456789abcdef' for c in reference) or not 0 < amount <= 922337203685 or currency not in ('usd', 'cny') or single('mode') != 'payment' or single('payment_method_types[0]') != 'card' or single('line_items[0][quantity]') != '1':
            raise ValueError('Invalid checkout intent')
        if not idem or len(idem) > 255: raise ValueError('Idempotency key required')
        request = json.dumps(form, sort_keys=True)
        with self.lock, self.db:
            prior = self.db.execute('SELECT * FROM sessions WHERE idem=?', (idem,)).fetchone()
            if prior:
                if prior['request'] != request: raise ValueError('Idempotency conflict')
                return json.loads(prior['body'])
            token = secrets.token_hex(24)
            session = 'cs_test_mock_' + token
            body = dict(id=session, object='checkout.session', client_reference_id=reference, currency=currency, amount_total=amount, livemode=False, mode='payment', status='open', payment_status='unpaid', url=f'https://checkout.stripe.com/c/pay/{session}')
            self.db.execute('INSERT INTO sessions VALUES(?,?,?,?,?,?)', (session, token, idem, request, json.dumps(body), 'pending'))
            return body

    def view(self, token):
        row = self.db.execute('SELECT * FROM sessions WHERE token=?', (token,)).fetchone()
        if not row: raise KeyError('Checkout not found')
        body = json.loads(row['body'])
        deliveries = self.db.execute('SELECT * FROM deliveries WHERE session=? ORDER BY id', (row['id'],)).fetchall()
        events = []
        for delivery in deliveries:
            event = json.loads(delivery['event'])
            retried = self.db.execute('SELECT 1 FROM retries WHERE original=?', (delivery['id'],)).fetchone() is not None
            history = self.db.execute('SELECT sent,status FROM attempts WHERE delivery=? ORDER BY sent,delivery', (delivery['id'],)).fetchall()
            events.append(dict(attempts=delivery['attempts'], delivered=delivery['delivered'],
                last_status=delivery['last_status'], event_type=event['type'], due=delivery['due'],
                retry_allowed=not retried and not delivery['delivered'] and delivery['attempts'] >= 8,
                retried=retried, history=[dict(attempt) for attempt in history]))
        return dict(test=True, amount=body['amount_total'], currency=body['currency'], outcome=row['outcome'],
            readiness=self.readiness(), return_url=self.return_url, deliveries=events)

    def retry(self, token, number):
        """Resend exhausted evidence unchanged, retaining the full original history."""
        if type(number) is not int or number < 1: raise ValueError('Invalid notification')
        with self.lock, self.db:
            row = self.db.execute('SELECT id FROM sessions WHERE token=?', (token,)).fetchone()
            if not row: raise KeyError('Checkout not found')
            deliveries = self.db.execute('SELECT * FROM deliveries WHERE session=? ORDER BY id', (row['id'],)).fetchall()
            if number > len(deliveries): raise KeyError('Notification not found')
            original = deliveries[number-1]
            if self.db.execute('SELECT 1 FROM retries WHERE original=?', (original['id'],)).fetchone():
                return self.view(token)
            if original['delivered'] or original['attempts'] < 8:
                raise ValueError('Notification has not exhausted automatic retries')
            replacement = self.db.execute('INSERT INTO deliveries(session,event,due) VALUES(?,?,?)',
                (row['id'], original['event'], time.time())).lastrowid
            self.db.execute('INSERT INTO retries VALUES(?,?)', (original['id'], replacement))
            return self.view(token)

    def decide(self, token, outcome):
        if outcome not in ('success','failure','cancel','timeout','delayed','duplicate','out_of_order'):
            raise ValueError('Unknown scenario')
        with self.lock, self.db:
            row = self.db.execute('SELECT * FROM sessions WHERE token=?', (token,)).fetchone()
            if not row: raise KeyError('Checkout not found')
            if row['outcome'] != 'pending':
                if row['outcome'] != outcome: raise ValueError('Checkout outcome already selected')
                return self.view(token)
            body = json.loads(row['body'])
            paid = outcome in ('success','delayed','duplicate','out_of_order')
            if paid: body.update(status='complete', payment_status='paid', url=None)
            elif outcome in ('failure','cancel'): body.update(status='expired', payment_status='unpaid', url=None)
            self.db.execute('UPDATE sessions SET body=?,outcome=? WHERE token=?', (json.dumps(body), outcome, token))
            if outcome != 'timeout':
                kind = 'checkout.session.completed' if paid else 'checkout.session.expired'
                event = dict(id='evt_mock_'+secrets.token_hex(16), object='event', type=kind, livemode=False, data=dict(object=body))
                now = time.time()
                payload = json.dumps(event, separators=(',', ':'))
                self.db.execute('INSERT INTO deliveries(session,event,due) VALUES(?,?,?)', (row['id'], payload, now + (15 if outcome == 'delayed' else 0)))
                if outcome == 'duplicate':
                    self.db.execute('INSERT INTO deliveries(session,event,due) VALUES(?,?,?)', (row['id'], payload, now + 1))
                if outcome == 'out_of_order':
                    # A stale unpaid event arrives after paid evidence. It must not undo funding.
                    stale = dict(body, status='open', payment_status='unpaid')
                    event.update(id='evt_mock_'+secrets.token_hex(16), type='checkout.session.async_payment_failed', data=dict(object=stale))
                    self.db.execute('INSERT INTO deliveries(session,event,due) VALUES(?,?,?)', (row['id'], json.dumps(event), now + 1))
            return self.view(token)

    def deliver(self):
        with self.lock, self.db:
            row = self.db.execute('SELECT * FROM deliveries WHERE delivered=0 AND attempts<8 AND due<=? ORDER BY due,id LIMIT 1', (time.time(),)).fetchone()
            if not row: return False
            # Claim briefly, then release: verification callbacks query this merchant.
            self.db.execute('UPDATE deliveries SET due=? WHERE id=?', (time.time()+30, row['id']))
        body = row['event'].encode()
        timestamp = str(int(time.time()))
        signature = hmac.new(self.secret.encode(), timestamp.encode()+b'.'+body, hashlib.sha256).hexdigest()
        request = Request(self.callback, body, {'Content-Type':'application/json','Stripe-Signature':f't={timestamp},v1={signature}'})
        try:
            with build_opener(NoRedirect).open(request, timeout=3) as response: status = response.status
        except HTTPError as error: status = error.code
        except (URLError, TimeoutError, OSError): status = 0
        with self.lock, self.db:
            self.db.execute('INSERT INTO attempts VALUES(?,?,?)', (row['id'], time.time(), status))
            self.db.execute('UPDATE deliveries SET attempts=attempts+1,delivered=CASE WHEN delivered=1 THEN 1 ELSE ? END,last_status=?,due=? WHERE id=?', (int(200 <= status < 300), status, time.time()+min(30,2**row['attempts']), row['id']))
        return True


def handler(merchant, assets):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass  # Never log checkout capability tokens.
        def reply(self, code, data):
            body = json.dumps(data).encode()
            self.send_response(code); self.send_header('Content-Type','application/json'); self.send_header('Cache-Control','no-store'); self.send_header('X-Content-Type-Options','nosniff'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
        def authorized(self):
            expected = 'Basic '+base64.b64encode((merchant.key+':').encode()).decode()
            return hmac.compare_digest(self.headers.get('Authorization',''),expected)
        def do_GET(self): self.dispatch(False)
        def do_POST(self): self.dispatch(True)
        def dispatch(self, post):
            if self.headers.get('Host') != urlsplit(merchant.origin).netloc:
                return self.reply(403, {'error':'Invalid host'})
            path = urlsplit(self.path).path
            try:
                if post:
                    length = int(self.headers.get('Content-Length','0'))
                    if not 0 < length <= 16384: return self.reply(413, {'error':'Invalid body size'})
                    raw = self.rfile.read(length)
                with merchant.lock:
                    if path == '/healthz' and not post:
                        return self.reply(200 if merchant.readiness() == 'ready' else 503, {'test':True,'enabled':merchant.enabled(),'readiness':merchant.readiness()})
                    if path.startswith('/v1/') or path == '/control':
                        if not self.authorized(): return self.reply(401, {'error':'Test merchant authentication required'})
                        if path == '/control' and post:
                            command = json.loads(raw)
                            if 'enabled' in command:
                                if type(command['enabled']) is not bool: raise ValueError('Invalid enabled state')
                                with merchant.db: merchant.db.execute("UPDATE settings SET value=? WHERE key='enabled'", ('true' if command['enabled'] else 'false',))
                                return self.reply(200, {'test':True,'enabled':merchant.enabled(),'readiness':merchant.readiness()})
                            value = command.get('readiness')
                            if value not in ('ready','unconfigured','unavailable'): raise ValueError('Invalid readiness')
                            with merchant.db: merchant.db.execute("UPDATE settings SET value=? WHERE key='readiness'", (value,))
                            return self.reply(200, {'test':True,'readiness':value})
                        if merchant.readiness() != 'ready': return self.reply(503, {'error':'Test payment service is not ready'})
                        if path == '/v1/checkout/sessions' and post:
                            return self.reply(200, merchant.create(parse_qs(raw.decode(),keep_blank_values=True), self.headers.get('Idempotency-Key')))
                        if path.startswith('/v1/checkout/sessions/') and not post:
                            row = merchant.db.execute('SELECT body FROM sessions WHERE id=?', (path.rsplit('/',1)[-1],)).fetchone()
                            if not row: raise KeyError('Session not found')
                            return self.reply(200,json.loads(row["body"]))
                    if path.startswith('/api/checkouts/'):
                        token = path.rsplit('/',1)[-1]
                        if post:
                            if self.headers.get('Origin') != merchant.origin and not self.authorized(): return self.reply(403, {'error':'Same-origin checkout required'})
                            command = json.loads(raw)
                            if 'retry' in command:
                                return self.reply(200,merchant.retry(token,command['retry']))
                            return self.reply(200,merchant.decide(token,command['outcome']))
                        return self.reply(200,merchant.view(token))
                if not post and (path.startswith('/checkout/') or path.startswith('/assets/')):
                    file = assets/'index.html' if path.startswith('/checkout/') else assets/path.lstrip('/')
                    if not file.resolve().is_relative_to(assets.resolve()) or not file.is_file(): raise KeyError('Build the mock checkout UI first')
                    body=file.read_bytes(); self.send_response(200)
                    self.send_header('Content-Type','text/html; charset=utf-8' if file.suffix=='.html' else 'text/css' if file.suffix=='.css' else 'application/javascript')
                    self.send_header('Cache-Control','no-store'); self.send_header('Referrer-Policy','no-referrer'); self.send_header('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'"); self.end_headers(); self.wfile.write(body); return
                raise KeyError('Not found')
            except KeyError: self.reply(404,{'error':'Checkout or endpoint not found'})
            except (ValueError,TypeError,UnicodeError): self.reply(400,{'error':'Invalid request or conflicting checkout outcome'})
    return Handler


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=2570)
    parser.add_argument('--disabled',action='store_true',help='Start new merchant state disabled; retain an existing saved selection')
    parser.add_argument('--state',type=Path,required=True)
    parser.add_argument('--callback',required=True)
    parser.add_argument('--return-url',required=True)
    parser.add_argument('--assets',type=Path,default=Path(__file__).resolve().parents[2]/'apps/dashboard/mock-payments/dist')
    args=parser.parse_args()
    key=os.environ.get('NIU_MOCK_PAYMENT_KEY',''); secret=os.environ.get('NIU_MOCK_PAYMENT_SECRET','')
    if not key.startswith('sk_test_') or len(key)<32 or not secret.startswith('whsec_') or len(secret)<32: parser.error('Explicit test credentials of at least 32 characters are required')
    callback=loopback_url(args.callback)
    return_parts = urlsplit(args.return_url)
    if return_parts.scheme != 'https': loopback_url(args.return_url)
    if return_parts.username or return_parts.password or return_parts.fragment: parser.error('Invalid return URL')
    return_url=args.return_url
    args.state.mkdir(parents=True,exist_ok=True); args.state.chmod(0o700)
    merchant=Merchant(args.state/'merchant.sqlite3',f'http://127.0.0.1:{args.port}',callback,return_url,key,secret,not args.disabled,os.environ.get('NIU_MOCK_PAYMENT_DATABASE_URL'))
    if (args.state/'merchant.sqlite3').exists(): (args.state/'merchant.sqlite3').chmod(0o600)
    stop=threading.Event()
    def worker():
        while not stop.wait(.2): merchant.deliver()
    thread=threading.Thread(target=worker,daemon=True); thread.start()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),handler(merchant,args.assets))
    print(f'Mock payments: {merchant.origin} — TEST ONLY, no real funds',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: stop.set(); server.server_close(); thread.join(4); merchant.db.close()

if __name__=='__main__': main()
