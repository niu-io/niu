import io
import urllib.error
import importlib.util
import subprocess
import unittest
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


def load_script(filename):
    spec = importlib.util.spec_from_file_location(filename.replace("-", "_"), ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PackageCommandErrorTests(unittest.TestCase):
    def test_missing_runtime_fails_before_resource_commands(self):
        for filename in ["package-smoke.py", "package-upgrade-smoke.py"]:
            with self.subTest(script=filename):
                module = load_script(filename)
                with patch.object(module.shutil, "which", return_value=None), \
                     patch.object(module.subprocess, "run") as run:
                    with self.assertRaisesRegex(SystemExit, "requires Docker; no resources were created"):
                        module.require_container_runtime()
                run.assert_not_called()

    def test_redirects_never_forward_credentials_or_leave_the_origin(self):
        for filename in ["package-smoke.py", "package-upgrade-smoke.py"]:
            with self.subTest(script=filename):
                module = load_script(filename)
                calls = []
                class Handler(BaseHTTPRequestHandler):
                    def do_GET(self):
                        calls.append((self.path, self.headers.get('Authorization')))
                        if self.path in ('/same', '/external'):
                            self.send_response(302)
                            host = 'localhost' if self.path == '/external' else '127.0.0.1'
                            self.send_header('Location', f'http://{host}:{self.server.server_port}/target')
                        else:
                            self.send_response(200)
                            self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(b'{}')
                    def log_message(self, *args):
                        pass
                server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
                threading.Thread(target=server.serve_forever, daemon=True).start()
                try:
                    module.BASE_URL = f'http://127.0.0.1:{server.server_port}'
                    for path, admin in [('/same', True), ('/external', True), ('/external', False)]:
                        with self.assertRaises(urllib.error.HTTPError) as failure:
                            module.request('GET', path, admin=admin)
                        self.assertEqual(failure.exception.code, 302)
                        failure.exception.close()
                    self.assertEqual(len(calls), 3)
                    self.assertFalse(any(path == '/target' for path, _ in calls))
                    credential_argument = 'bearer_token' if filename == 'package-smoke.py' else 'token'
                    with self.assertRaises(urllib.error.HTTPError) as failure:
                        module.request('GET', '/same', **{credential_argument: 'fixture-workspace-token'})
                    failure.exception.close()
                    self.assertEqual(calls[-1], ('/same', 'Bearer fixture-workspace-token'))
                    self.assertFalse(any(path == '/target' for path, _ in calls))
                    self.assertEqual(module.request('GET', '/same')[0], 200)
                    self.assertEqual(calls[-1], ('/target', None))
                finally:
                    server.shutdown()
                    server.server_close()

    def test_failed_engine_commands_never_repeat_arguments_or_output(self):
        for filename in ["package-smoke.py", "package-upgrade-smoke.py"]:
            with self.subTest(script=filename):
                module = load_script(filename)
                result = subprocess.CompletedProcess(
                    ["docker"], 125, stdout="private-output-credential",
                    stderr="private-error-credential",
                )
                with patch.object(module.subprocess, "run", return_value=result):
                    with self.assertRaises(RuntimeError) as failure:
                        module.docker("run", "-e", "NIU_ADMIN_TOKENS=private-argument-credential")
                message = str(failure.exception)
                self.assertEqual(message, "Docker run failed (exit 125)")
                self.assertNotIn("private", message)
                self.assertNotIn("NIU_ADMIN_TOKENS", message)

    def test_readiness_failures_do_not_repeat_response_or_transport_details(self):
        for filename in ["package-smoke.py", "package-upgrade-smoke.py"]:
            module = load_script(filename)
            for response in ["body", "transport"]:
                with self.subTest(script=filename, response=response):
                    value = (503, {"status": "private-body-credential"})
                    if filename == "package-smoke.py":
                        value += ({},)
                    with patch.object(module, "request", return_value=value,
                                      side_effect=OSError("private-transport-credential") if response == "transport" else None), \
                         patch.object(module, "docker", return_value=subprocess.CompletedProcess([], 0, stdout="running", stderr="")), \
                         patch.object(module.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, stdout="running", stderr="")), \
                         patch.object(module.time, "sleep"):
                        with self.assertRaises(RuntimeError) as failure:
                            module.wait_for_application()
                    self.assertNotIn("private", str(failure.exception))
                    self.assertIn("ready", str(failure.exception))

    def test_upgrade_early_exit_does_not_read_or_publish_container_logs(self):
        module = load_script("package-upgrade-smoke.py")
        with patch.object(module, "docker", return_value=subprocess.CompletedProcess([], 0, stdout="exited", stderr="")) as docker:
            with self.assertRaisesRegex(RuntimeError, "exited before becoming ready"):
                module.wait_for_application()
        self.assertEqual(docker.call_count, 1)

    def test_install_early_exit_stops_before_http_or_log_reads(self):
        module = load_script("package-smoke.py")
        for status in ['exited', 'dead']:
            with self.subTest(status=status), patch.object(module.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, stdout=status, stderr='private-output')) as run, patch.object(module, 'request') as request:
                with self.assertRaisesRegex(RuntimeError, 'exited before becoming ready'):
                    module.wait_for_application()
                request.assert_not_called()
                self.assertEqual(run.call_count, 1)
                self.assertEqual(run.call_args.args[0][1], 'inspect')

    def test_provider_probe_failure_does_not_repeat_engine_output(self):
        module = load_script("package-smoke.py")
        result = subprocess.CompletedProcess([], 7, stdout="private-output", stderr="private-error")
        with patch.object(module.subprocess, "run", return_value=result), patch.object(module.time, "sleep"):
            with self.assertRaises(RuntimeError) as failure:
                module.wait_for_mock_provider()
        self.assertIn("exit 7", str(failure.exception))
        self.assertNotIn("private", str(failure.exception))

    def test_inference_failure_reports_status_without_body_or_logs(self):
        module = load_script("package-smoke.py")
        error = urllib.error.HTTPError("http://localhost", 502, "private-reason", {}, io.BytesIO(b"private-body"))
        with patch.object(module.LOCAL_OPENER, "open", side_effect=error), patch.object(module.subprocess, "run") as run:
            with self.assertRaises(RuntimeError) as failure:
                module.verify_packaged_inference("fixture-token")
        self.assertEqual(str(failure.exception), "packaged inference returned HTTP 502")
        self.assertTrue(failure.exception.__suppress_context__)
        run.assert_not_called()

    def test_upgrade_unchecked_failure_remains_available_for_negative_assertions(self):
        module = load_script("package-upgrade-smoke.py")
        result = subprocess.CompletedProcess(["docker"], 1, stdout="", stderr="failed")
        with patch.object(module.subprocess, "run", return_value=result):
            self.assertIs(module.docker("inspect", "missing", check=False), result)


if __name__ == "__main__":
    unittest.main()
