#!/usr/bin/env python3
"""Inspect or change the local mock merchant's readiness without exposing credentials."""
import argparse
import base64
import json
import os
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, ProxyHandler
from service import NoRedirect, loopback_url


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('state', choices=['status', 'ready', 'unconfigured', 'unavailable'])
    parser.add_argument('--url', default='http://127.0.0.1:2570')
    durable = Path.home()/'.local/state/niu/dev'
    legacy = Path(f'/tmp/niu-core-dev-{os.getuid()}')
    parser.add_argument('--credentials', type=Path, default=(durable if durable.exists() or not legacy.exists() else legacy)/'mock-payment-credentials.json')
    args = parser.parse_args()
    try:
        origin = loopback_url(args.url).rstrip('/')
        if args.state == 'status':
            request = Request(origin+'/healthz')
        else:
            key = json.loads(args.credentials.read_text())['key']
            request = Request(origin+'/control', json.dumps({'readiness':args.state}).encode(),
                {'Content-Type':'application/json', 'Authorization':'Basic '+base64.b64encode((key+':').encode()).decode()})
        client = build_opener(ProxyHandler({}), NoRedirect)
        try:
            with client.open(request, timeout=5) as response: payload = json.loads(response.read())
        except HTTPError as error:
            if args.state != 'status' or error.code != 503: raise
            payload = json.loads(error.read())
        if payload.get('test') is not True or payload.get('readiness') not in ('ready','unconfigured','unavailable'):
            raise ValueError('Unexpected service response')
        print('Mock payments: '+payload['readiness']+' (test environment)')
        if payload['readiness'] != 'ready':
            print('New checkouts and reconciliation queries are blocked. Queued notifications continue.')
            print('Restore with: python3 tools/mock-payments/control.py ready')
    except (OSError, ValueError, KeyError, URLError):
        parser.exit(1, 'Cannot control the mock merchant. Check the service URL and private credentials file; start with pnpm dev and enable Mock payments in Admin → Payment gateways.\n')

if __name__ == '__main__': main()
