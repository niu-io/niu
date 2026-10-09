#!/usr/bin/env python3
"""Measure synthetic Guardrails preview latency; never dispatches inference."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import math
import os
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID

MAX_PREVIEW_RESPONSE_BYTES = 65536


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def percentile(values, fraction):
    return round(sorted(values)[max(0, math.ceil(len(values) * fraction) - 1)], 3) if values else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--samples', type=int, default=12)
    parser.add_argument('--warmup', type=int, default=3, help='unmeasured calls per case (0–100)')
    parser.add_argument('--concurrency', type=int, nargs='+', default=[1, 4, 8])
    parser.add_argument('--bytes', type=int, nargs='+', default=[4096, 65536, 524288])
    parser.add_argument('--output-modes', nargs='+', choices=['buffered_full', 'observe_only'], default=['buffered_full'], help='explicit complete-output preview modes')
    args = parser.parse_args()
    if not 1 <= args.samples <= 100 or not 0 <= args.warmup <= 100 or any(not 1 <= n <= 16 for n in args.concurrency) or any(not 1 <= n <= 786432 for n in args.bytes):
        parser.error('samples 1–100, warmup 0–100, concurrency 1–16 and text bytes 1–786432 required')
    required = ['NIU_ADMIN_BASE_URL', 'NIU_ADMIN_TOKEN', 'NIU_ORGANIZATION_ID', 'NIU_WORKSPACE_ID']
    if any(not os.environ.get(name) for name in required):
        parser.error('required environment: ' + ', '.join(required))
    base = os.environ['NIU_ADMIN_BASE_URL'].rstrip('/')
    target = urlsplit(base)
    if target.username or target.password or target.query or target.fragment or not (target.scheme == 'https' or target.scheme == 'http' and target.hostname in ('localhost', '127.0.0.1', '::1')):
        parser.error('use HTTPS or loopback HTTP without URL credentials/query/fragment')
    try:
        org, workspace = [str(UUID(os.environ[name])) for name in required[2:]]
    except ValueError:
        parser.error('organization/workspace identifiers must be UUIDs')
    endpoint = f'{base}/organizations/{org}/projects/{workspace}/guardrails'
    token = os.environ['NIU_ADMIN_TOKEN']
    results = []
    stages = [('input', None)] + [('output', mode) for mode in dict.fromkeys(args.output_modes)]
    for stage, mode in stages:
        for size in args.bytes:
            for rule_count in (1, 32):
                rules = [{'pattern': f'benchmark-fixture-{i}-absent', 'action': 'block'} for i in range(rule_count)]
                text = 'x' * size
                fixture = {'messages': [{'role': 'user', 'content': text}]} if stage == 'input' else {'choices': [{'message': {'role': 'assistant', 'content': text}}]}
                payload = {'protocol': 'chat', 'rules': rules, 'request' if stage == 'input' else 'response': fixture}
                if mode is not None:
                    payload['mode'] = mode
                body = json.dumps(payload).encode()
                for concurrency in args.concurrency:
                    def sample(_):
                        started = time.perf_counter()
                        request = Request(f'{endpoint}/{stage}-preview', data=body, headers={'authorization': f'Bearer {token}', 'content-type': 'application/json'}, method='POST')
                        status, valid = None, False
                        try:
                            with build_opener(NoRedirect()).open(request, timeout=15) as response:
                                status = response.status
                                response_body = response.read(MAX_PREVIEW_RESPONSE_BYTES + 1)
                                if len(response_body) <= MAX_PREVIEW_RESPONSE_BYTES:
                                    value = json.loads(response_body)
                                    valid = isinstance(value, dict) and value.get('synthetic') is True and value.get('enforcement') is False and value.get('outcome') == ('clear' if mode == 'observe_only' else 'allowed') and value.get('reason') == 'inspected_text' and value.get('redacted') is False
                                    if valid and stage == 'output':
                                        valid = value.get('mode') == mode and value.get('coverage') == 'local_text'
                        except HTTPError as error:
                            status = error.code
                            error.close()
                        except (URLError, TimeoutError, OSError, ValueError):
                            pass
                        return (time.perf_counter() - started) * 1000, status, valid
                    with ThreadPoolExecutor(max_workers=concurrency) as executor:
                        warmup = list(executor.map(sample, range(args.warmup)))
                        started = time.perf_counter()
                        samples = list(executor.map(sample, range(args.samples)))
                        elapsed = time.perf_counter() - started
                    statuses = {}
                    for _, status, _ in samples:
                        label = str(status) if status is not None else 'transport_error'
                        statuses[label] = statuses.get(label, 0) + 1
                    valid_times = [duration for duration, _, valid in samples if valid]
                    results.append({'stage': stage, 'mode': mode, 'text_bytes': size, 'request_bytes': len(body), 'rules': rule_count, 'concurrency': concurrency, 'warmup_calls': len(warmup), 'warmup_valid_results': sum(valid for _, _, valid in warmup), 'samples': args.samples, 'valid_results': len(valid_times), 'status_counts': statuses, 'elapsed_seconds': round(elapsed, 3), 'valid_results_per_second': round(len(valid_times) / elapsed, 3), 'p50_ms': percentile(valid_times, .50), 'p95_ms': percentile(valid_times, .95), 'p99_ms': percentile(valid_times, .99)})
    print(json.dumps({'measurement': 'synthetic_chat_preview_http', 'percentiles': 'nearest_rank_of_valid_results', 'inference_calls': 0, 'cases': results}, indent=2))
    return 0 if all(case['valid_results'] == case['samples'] and case['warmup_valid_results'] == case['warmup_calls'] for case in results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
