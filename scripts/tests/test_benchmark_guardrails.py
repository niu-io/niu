import json
import os
from pathlib import Path
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import unittest


class BenchmarkGuardrailsTest(unittest.TestCase):
    def run_fixture(self, status, body=None, warmup=0, fail_warmup=False, modes=None, dynamic_modes=False):
        calls = []
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                calls.append(self.path)
                observed_status = 503 if fail_warmup and (len(calls) - 1) % (warmup + 1) < warmup else status
                self.send_response(observed_status)
                if status == 307:
                    self.send_header('Location', f'http://127.0.0.1:{self.server.server_port}/forbidden-redirect')
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                payload = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0'))))
                response_body = body.copy() if isinstance(body, dict) else body
                if isinstance(response_body, dict):
                    response_body.setdefault('reason', 'inspected_text')
                    response_body.setdefault('redacted', False)
                    if self.path.endswith('/output-preview'):
                        response_body.setdefault('mode', payload.get('mode', 'buffered_full'))
                        response_body.setdefault('coverage', 'local_text')
                        if dynamic_modes and payload.get('mode') == 'observe_only':
                            response_body['outcome'] = 'clear'
                self.wfile.write(json.dumps({} if response_body is None else response_body).encode())
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        identifier = '12345678-1234-1234-1234-123456789abc'
        env = dict(os.environ, NIU_ADMIN_BASE_URL=f'http://127.0.0.1:{server.server_port}/admin/v1', NIU_ADMIN_TOKEN='fixture-admin-credential', NIU_ORGANIZATION_ID=identifier, NIU_WORKSPACE_ID=identifier)
        result = subprocess.run([sys.executable, str(Path(__file__).resolve().parents[1] / 'benchmark-guardrails.py'), '--samples', '1', '--warmup', str(warmup), '--concurrency', '1', '--bytes', '32'] + (['--output-modes'] + modes if modes else []), env=env, capture_output=True, text=True, timeout=15)
        self.assertNotIn(identifier, result.stdout)
        self.assertNotIn('fixture-admin-credential', result.stdout + result.stderr)
        return result, calls

    def test_redirects_are_not_followed_or_counted_as_valid(self):
        result, calls = self.run_fixture(307)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(len(calls), 4)
        self.assertTrue(all('/forbidden-redirect' not in path for path in calls))
        self.assertTrue(all(case['status_counts'] == {'307': 1} and case['valid_results'] == 0 and case['p95_ms'] is None for case in json.loads(result.stdout)['cases']))

    def test_http_success_does_not_replace_synthetic_coverage_checks(self):
        result, _ = self.run_fixture(200, {'outcome': 'allowed', 'synthetic': False, 'enforcement': True})
        self.assertEqual(result.returncode, 1)
        self.assertTrue(all(case['valid_results'] == 0 for case in json.loads(result.stdout)['cases']))

    def test_valid_synthetic_results_are_reported_without_sensitive_context(self):
        result, calls = self.run_fixture(200, {'outcome': 'allowed', 'synthetic': True, 'enforcement': False})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(calls), 4)
        self.assertTrue(all(case['valid_results'] == 1 for case in json.loads(result.stdout)['cases']))

    def test_non_object_json_is_reported_as_failed_samples(self):
        for body in ([], ['fixture'], 'fixture', 42, True):
            with self.subTest(body=body):
                result, calls = self.run_fixture(200, body)
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertEqual(len(calls), 4)
                self.assertTrue(all(case['status_counts'] == {'200': 1} and case['valid_results'] == 0 and case['p95_ms'] is None for case in json.loads(result.stdout)['cases']))

    def test_oversized_success_is_not_counted_as_valid(self):
        result, calls = self.run_fixture(200, {'outcome': 'allowed', 'synthetic': True, 'enforcement': False, 'padding': 'x' * 65536})
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(len(calls), 4)
        self.assertTrue(all(case['valid_results'] == 0 and case['p95_ms'] is None for case in json.loads(result.stdout)['cases']))

    def test_warmup_is_separate_from_measurement_samples(self):
        result, calls = self.run_fixture(200, {'outcome': 'allowed', 'synthetic': True, 'enforcement': False}, warmup=2)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(calls), 12)
        self.assertTrue(all(case['warmup_calls'] == 2 and case['warmup_valid_results'] == 2 and case['samples'] == 1 and case['valid_results'] == 1 and case['status_counts'] == {'200': 1} for case in json.loads(result.stdout)['cases']))

    def test_warmup_failures_cannot_pass_with_successful_measured_samples(self):
        result, _ = self.run_fixture(200, {'outcome': 'allowed', 'synthetic': True, 'enforcement': False}, warmup=2, fail_warmup=True)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertTrue(all(case['warmup_valid_results'] == 0 and case['valid_results'] == 1 for case in json.loads(result.stdout)['cases']))

    def test_observation_is_measured_separately_without_claiming_enforcement(self):
        result, calls = self.run_fixture(200, {'outcome': 'allowed', 'synthetic': True, 'enforcement': False}, modes=['buffered_full', 'observe_only'], dynamic_modes=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(calls), 6)
        cases = json.loads(result.stdout)['cases']
        self.assertEqual({case['mode'] for case in cases if case['stage'] == 'output'}, {'buffered_full', 'observe_only'})
        self.assertTrue(all(case['valid_results'] == 1 for case in cases))

    def test_wrong_output_mode_cannot_count_as_valid_latency(self):
        result, _ = self.run_fixture(200, {'outcome': 'allowed', 'synthetic': True, 'enforcement': False, 'mode': 'observe_only'})
        self.assertEqual(result.returncode, 1)
        cases = json.loads(result.stdout)['cases']
        self.assertTrue(all(case['valid_results'] == 0 and case['p99_ms'] is None for case in cases if case['stage'] == 'output'))

    def test_redacted_fixture_is_not_a_valid_no_match_measurement(self):
        result, _ = self.run_fixture(200, {'outcome': 'allowed', 'synthetic': True, 'enforcement': False, 'redacted': True})
        self.assertEqual(result.returncode, 1)
        self.assertTrue(all(case['valid_results'] == 0 for case in json.loads(result.stdout)['cases']))


if __name__ == '__main__':
    unittest.main()
