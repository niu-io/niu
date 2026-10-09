#!/usr/bin/env python3
"""Measure actual workspace request-list, detail or key occupancy reads; never generates inference."""
import argparse
import concurrent.futures
import hashlib
import http.client
import json
import math
import os
import re
import ssl
import time
from urllib.parse import urlsplit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--endpoint', required=True)
    parser.add_argument('--token-env', default='NIU_BENCHMARK_TOKEN')
    parser.add_argument('--concurrency', type=int, default=8)
    parser.add_argument('--seconds', type=int, default=30)
    parser.add_argument('--fresh-connections', action='store_true')
    args = parser.parse_args()
    url = urlsplit(args.endpoint)
    identifier = r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}'
    route = rf'/admin/v1/organizations/{identifier}/projects/{identifier}/requests'
    is_list = bool(re.fullmatch(route, url.path)
                   and re.fullmatch(r'limit=(?:[1-9]|[1-9][0-9]|100)', url.query))
    is_detail = bool(re.fullmatch(route + '/' + identifier, url.path) and not url.query)
    is_occupancy = bool(re.fullmatch(rf'/admin/v1/organizations/{identifier}/projects/{identifier}/keys/{identifier}/concurrency-limit', url.path) and not url.query)
    if (url.scheme not in ('http', 'https') or not url.hostname or url.username
            or url.password or url.fragment or not (is_list or is_detail or is_occupancy)):
        parser.error('Use a request-list URL with only limit=1..100, or a request-detail/key-concurrency URL without query parameters')
    if not 1 <= args.concurrency <= 64 or not 1 <= args.seconds <= 600:
        parser.error('Concurrency must be 1..64 and seconds 1..600')
    token = os.environ.get(args.token_env, '')
    if not token or '\r' in token or '\n' in token:
        parser.error('The token environment variable must contain a credential')
    path = url.path + ('?' + url.query if url.query else '')

    def connect():
        if url.scheme == 'https':
            return http.client.HTTPSConnection(url.hostname, url.port, timeout=10,
                                               context=ssl.create_default_context())
        return http.client.HTTPConnection(url.hostname, url.port, timeout=10)

    def read(connection):
        started = time.perf_counter()
        connection.request('GET', path, headers={'Authorization': 'Bearer ' + token})
        response = connection.getresponse()
        body = response.read(4 * 1024 * 1024 + 1)
        elapsed = (time.perf_counter() - started) * 1000
        if response.status != 200 or len(body) > 4 * 1024 * 1024:
            raise ValueError('Unexpected status or oversized response')
        document = json.loads(body)
        data = document.get('data') if isinstance(document, dict) else None
        if is_list:
            if not isinstance(data, list):
                raise ValueError('Unexpected response shape')
            records = len(data)
        elif is_occupancy:
            if (not isinstance(data, dict) or type(data.get('active_requests')) is not int
                    or data['active_requests'] < 1 or 'max_concurrent_requests' not in data
                    or 'revision' not in data):
                raise ValueError('Use a key with actual unresolved dispatched requests')
            records = data['active_requests']
        else:
            if (not isinstance(data, dict)
                    or data.get('attempt_id', '').lower() != url.path.rsplit('/', 1)[1].lower()):
                raise ValueError('Unexpected request detail')
            records = 1
        digest = hashlib.sha256(json.dumps(document, sort_keys=True).encode()).digest()
        return elapsed, digest, records, len(body)

    connection = connect()
    try:
        _, baseline, row_count, byte_count = read(connection)
    except Exception:
        raise SystemExit('Initial read failed; response and credentials withheld') from None
    finally:
        connection.close()
    if not row_count:
        raise SystemExit('Use a workspace with actual saved requests; empty pages are not qualified')

    started = time.perf_counter()
    deadline = started + args.seconds

    def worker(_):
        timings, errors, mismatches = [], 0, 0
        connection = connect()
        try:
            while time.perf_counter() < deadline:
                try:
                    elapsed, digest, _, _ = read(connection)
                    if digest != baseline:
                        mismatches += 1
                    else:
                        timings.append(elapsed)
                except Exception:
                    errors += 1
                    connection.close()
                    # Stop this worker after an error; no retry or tight failure loop.
                    break
                if args.fresh_connections:
                    connection.close()
                    connection = connect()
        finally:
            connection.close()
        return timings, errors, mismatches

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        results = list(pool.map(worker, range(args.concurrency)))
    wall = time.perf_counter() - started
    timings = sorted(ms for result in results for ms in result[0])
    errors = sum(result[1] for result in results)
    mismatches = sum(result[2] for result in results)
    def percentile(fraction):
        return round(timings[math.ceil(len(timings) * fraction) - 1], 3) if timings else None
    print(json.dumps({
        'scope': 'actual saved-request or occupancy reads; not inference or production capacity',
        'endpoint_kind': 'key_occupancy' if is_occupancy else ('list' if is_list else 'detail'),
        'connection_mode': 'fresh' if args.fresh_connections else 'persistent',
        'concurrency': args.concurrency, 'requested_seconds': args.seconds,
        'elapsed_seconds': round(wall, 3),
        ('active_requests' if is_occupancy else 'page_rows'): row_count,
        'baseline_bytes': byte_count, 'matching_responses': len(timings),
        'errors': errors, 'changed_responses': mismatches,
        'matching_responses_per_second': round(len(timings) / wall, 2),
        'p50_ms': percentile(.5), 'p95_ms': percentile(.95), 'p99_ms': percentile(.99),
        'max_ms': round(max(timings), 3) if timings else None,
    }, indent=2))
    if errors or mismatches or not timings:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
