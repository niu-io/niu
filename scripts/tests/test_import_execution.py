import importlib.util
import json
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import tempfile
import threading
import unittest
import urllib.error

spec = importlib.util.spec_from_file_location("import_execution", Path(__file__).parents[1] / "import_execution.py")
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)
ID = "00000000-0000-4000-8000-000000000001"


class ImportTests(unittest.TestCase):
    def test_only_secure_origin_and_valid_scope(self):
        for url in ["http://example.com", "https://user:secret@example.com", "https://example.com/?token=x", "https://example.com/path"]:
            with self.assertRaises(ValueError):
                importer.endpoint(url, ID, ID)
        self.assertIn("/execution-imports", importer.endpoint("http://127.0.0.1:2555", ID, ID))

    def test_upload_is_explicit_and_redirects_are_not_followed(self):
        requests = []
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                requests.append((self.path, self.headers.get("Authorization"), self.rfile.read(int(self.headers["Content-Length"]))))
                if len(requests) == 1:
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(json.dumps({"id": ID}).encode())
                else:
                    self.send_response(307)
                    self.send_header("Location", "/redirect-target")
                    self.end_headers()
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "export.json"
                data = Path(__file__).parents[2] / "contracts/fixtures/parallel-task.v1.json"
                path.write_bytes(data.read_bytes())
                origin = f"http://127.0.0.1:{server.server_port}"
                self.assertEqual(importer.import_record(origin, ID, ID, path, "fixture-admin"), ID)
                self.assertEqual(requests[0][1], "Bearer fixture-admin")
                self.assertEqual(requests[0][2], path.read_bytes())
                with self.assertRaises(urllib.error.HTTPError):
                    importer.import_record(origin, ID, ID, path, "fixture-admin")
                self.assertEqual(len(requests), 2)
                path.write_bytes(b"x" * (importer.MAX_BYTES + 1))
                with self.assertRaises(ValueError):
                    importer.import_record(origin, ID, ID, path, "fixture-admin")
                self.assertEqual(len(requests), 2)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
