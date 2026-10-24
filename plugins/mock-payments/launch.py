#!/usr/bin/env python3
"""Supervise the opt-in merchant plugin beside the gateway in a composed image."""
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import urllib.request
import urllib.error


def main():
    env = os.environ.copy()
    gateway = env.get('NIU_GATEWAY_BINARY', '/app/bin/niu')
    if not env.get('NIU_MOCK_PAYMENT_URL'):
        os.execv(gateway, [gateway, *sys.argv[1:]])
    from urllib.parse import urlsplit
    base = urlsplit(env['NIU_MOCK_PAYMENT_URL'])
    if base.scheme != 'http' or base.hostname != '127.0.0.1' or not base.port or base.path not in ('', '/'):
        raise SystemExit('Mock plugin transport must use an explicit loopback HTTP port')
    if not env.get('NIU_MOCK_PAYMENT_DATABASE_URL'):
        raise SystemExit('Hosted mock plugin requires persistent PostgreSQL storage')
    public = env.get('NIU_PUBLIC_ORIGIN', '').rstrip('/')
    if not public.startswith('https://'):
        raise SystemExit('Hosted mock checkout requires NIU_PUBLIC_ORIGIN with HTTPS')
    children = []
    def stop(*_):
        for child in children:
            if child.poll() is None: child.terminate()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        plugin = subprocess.Popen([sys.executable, str(Path(__file__).with_name('service.py')),
            '--disabled', '--port', str(base.port), '--state', '/run/niu/mock-payments',
            '--callback', f"http://127.0.0.1:{env.get('PORT', '10000')}/payments/stripe/notify",
            '--return-url', public + '/settings/payments', '--assets', '/app/mock-payments-ui'], env=env)
        children.append(plugin)
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if plugin.poll() is not None: raise SystemExit('Mock plugin exited during startup')
            try:
                urllib.request.urlopen(env['NIU_MOCK_PAYMENT_URL'].rstrip('/') + '/healthz', timeout=1).close()
                break
            except urllib.error.HTTPError as error:
                if error.code == 503: break  # disabled is a healthy selectable state
                raise
            except (OSError, urllib.error.URLError): time.sleep(.1)
        else: raise SystemExit('Mock plugin startup timed out')
        children.append(subprocess.Popen([gateway, *sys.argv[1:]], env=env))
        while all(child.poll() is None for child in children): time.sleep(.2)
    finally:
        stop()
        for child in children:
            try: child.wait(timeout=10)
            except subprocess.TimeoutExpired: child.kill(); child.wait()
    raise SystemExit(next((child.returncode for child in children if child.returncode), 0))


if __name__ == '__main__': main()
