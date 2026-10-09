import json
from pathlib import Path
import subprocess
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class GatewayBenchmarkTest(unittest.TestCase):
    def run_fixture(self, statuses, mode="rate", body=b"{}", extra_args=(), expected_exit=1):
        class Handler(BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'
            count = 0

            def do_POST(self):
                self.rfile.read(int(self.headers['Content-Length']))
                status = statuses[Handler.count % len(statuses)]
                Handler.count += 1
                self.send_response(status)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            script = Path(__file__).resolve().parents[1] / 'gateway-benchmark.py'
            run = subprocess.run([
                sys.executable, str(script),
                f'http://127.0.0.1:{server.server_port}/v1/chat/completions',
                '--model', 'fixture', '--workers', '1', '--duration', '0.2',
                '--mode', mode, '--warmup-per-worker', '0',
                *(['--rate', '20'] if mode == 'rate' else []), *extra_args,
            ], capture_output=True, text=True, timeout=10)
            self.assertEqual(run.returncode, expected_exit, run.stderr)
            return json.loads(run.stdout)['result']
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_oversized_success_response_is_not_successful_measurement(self):
        result = self.run_fixture([200], body=b'x' * 257,
                                  extra_args=['--max-response-bytes', '256'])
        self.assertEqual(result['requests']['transport_errors'], {'ResponseTooLarge': 4})
        self.assertEqual(result['requests']['http_responses'], 0)
        self.assertEqual(result['requests']['succeeded'], 0)
        self.assertEqual(result['latency_ms']['samples'], 0)
        self.assertIsNone(result['successful_http_latency_ms']['p99'])

    def test_exact_response_limit_is_accepted(self):
        result = self.run_fixture([200], body=b'x' * 256,
                                  extra_args=['--max-response-bytes', '256'], expected_exit=0)
        self.assertEqual(result['requests']['succeeded'], 4)
        self.assertEqual(result['requests']['transport_error_count'], 0)

    def test_mixed_http_results_have_separate_populations(self):
        result = self.run_fixture([200, 429])
        self.assertEqual(result['requests']['status_counts'], {'200': 2, '429': 2})
        self.assertEqual(result['latency_ms']['samples'], 4)
        self.assertEqual(result['successful_http_latency_ms']['samples'], 2)
        self.assertEqual(result['failed_http_latency_ms']['samples'], 2)
        self.assertEqual(result['latency_population'], 'all_http_responses_excluding_transport_errors')

    def test_concurrency_mode_separates_rejections(self):
        result = self.run_fixture([200, 429], mode="concurrency")
        self.assertGreater(result['successful_http_latency_ms']['samples'], 0)
        self.assertGreater(result['failed_http_latency_ms']['samples'], 0)
        self.assertEqual(result['successful_http_latency_ms']['samples'],
                         result['requests']['status_counts']['200'])
        self.assertEqual(result['failed_http_latency_ms']['samples'],
                         result['requests']['status_counts']['429'])
        self.assertEqual(result['latency_ms']['samples'],
                         result['requests']['http_responses'])

    def test_rejected_requests_do_not_report_success_latency(self):
        result = self.run_fixture([503])
        self.assertEqual(result['requests']['succeeded'], 0)
        success = result['successful_http_latency_ms']
        self.assertEqual(success['samples'], 0)
        for key in ('p50', 'p90', 'p95', 'p99', 'max', 'mean'):
            self.assertIsNone(success[key])
        self.assertEqual(result['failed_http_latency_ms']['samples'], 4)


if __name__ == '__main__':
    unittest.main()
