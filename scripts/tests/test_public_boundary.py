import tempfile
import unittest
import subprocess
import sys
from pathlib import Path

from scripts.public_boundary import build_input_errors, scan_files


class PublicBoundaryTest(unittest.TestCase):
    def test_cli_rejects_checks_that_scan_no_files(self):
        script = Path(__file__).resolve().parents[1] / 'check-public-boundary.py'
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for selection in [[], [str(root)]]:
                result = subprocess.run([sys.executable, str(script), '--root', str(root), *selection], capture_output=True, text=True)
                self.assertEqual(result.returncode, 2)
                self.assertIn('No files selected', result.stderr)
                self.assertNotIn('checks passed', result.stdout)
            source = root / 'source.txt'
            source.write_text('Public source fixture\n')
            empty = root / 'empty-artifact'
            empty.mkdir()
            result = subprocess.run([sys.executable, str(script), '--root', str(root), str(source), str(empty)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertIn('No files selected', result.stderr)
            result = subprocess.run([sys.executable, str(script), '--root', str(root), str(source)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0)
            self.assertIn('1 files scanned', result.stdout)

    def scan_fixture(self, contents: str):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "fixture.txt"
            path.write_text(contents, encoding="utf-8")
            return scan_files([path])

    def test_allows_documented_public_placeholders(self):
        findings = self.scan_fixture(
            "api_key=YOUR_NIU_API_KEY\n"
            "Authorization: Bearer example\n"
            "https://github.com/niu-io/niu/issues/1\n"
        )
        self.assertEqual(findings, [])

    def test_rejects_private_issue_links_without_echoing_url(self):
        org = "niu-io"
        private_repo = "enterprise"
        findings = self.scan_fixture(
            f"https://github.com/{org}/{private_repo}/issues/123"
        )
        self.assertEqual([label for label, _ in findings], ["private Enterprise issue link"])

    def test_rejects_local_source_paths(self):
        local_path = "/Users/alice/Niu/" + "enterprise/src/main.rs"
        findings = self.scan_fixture(local_path)
        self.assertEqual([label for label, _ in findings], ["local Niu source path"])

    def test_rejects_credentials_and_private_key_material(self):
        findings = self.scan_fixture(
            "key=sk-" + "a" * 40 + "\n"
            "-----BEGIN " + "PRIVATE KEY" + "-----\n"
        )
        self.assertEqual(
            [label for label, _ in findings],
            ["OpenAI-style API credential", "private key material"],
        )

    def test_json_copy_and_add_cannot_bypass_input_boundaries(self):
        cases = [
            ('COPY [".", "/app"]', 'whole build context'),
            ('COPY --chown=10001:10001 ["../private", "/app"]', 'outside the build context'),
            ('COPY ["apps/*", "/app"]', 'wildcard build input'),
            ('COPY ["apps", 1]', 'invalid JSON COPY inputs'),
            ('ADD https://example.invalid/private.tar /app', 'uses ADD'),
        ]
        for instruction, expected in cases:
            with self.subTest(instruction=instruction), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / '.dockerignore').write_text('.git\n.env\n.env.*\nnode_modules\ntarget\nenterprise\ninternal\n')
                (root / 'Dockerfile').write_text('FROM scratch\n' + instruction + '\n')
                self.assertTrue(any(expected in error for error in build_input_errors(root)))

    def test_explicit_json_copy_remains_supported(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.dockerignore').write_text('.git\n.env\n.env.*\nnode_modules\ntarget\nenterprise\ninternal\n')
            (root / 'Dockerfile').write_text('FROM scratch\nCOPY --chown=10001:10001 ["apps/dashboard", "/app"]\n')
            self.assertEqual(build_input_errors(root), [])

    def test_copy_from_requires_an_existing_build_stage(self):
        for source, accepted in [('dashboard', True), ('0', True), ('2', False), ('private/website:latest', False)]:
            with self.subTest(source=source), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / '.dockerignore').write_text('.git\n.env\n.env.*\nnode_modules\ntarget\nenterprise\ninternal\n')
                (root / 'Dockerfile').write_text('FROM node:24 AS dashboard\nFROM scratch\nCOPY --from=' + source + ' /workspace/dist /app\n')
                errors = build_input_errors(root)
                self.assertEqual(not errors, accepted)

    def test_requires_excluded_private_context_and_explicit_copy_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".dockerignore").write_text(".git\nnode_modules\n", encoding="utf-8")
            (root / "Dockerfile").write_text("FROM scratch\nCOPY . /app\n", encoding="utf-8")
            errors = build_input_errors(root)
        self.assertTrue(any("missing required exclusions" in error for error in errors))
        self.assertTrue(any("whole build context" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
