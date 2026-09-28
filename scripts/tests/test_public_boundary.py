import tempfile
import unittest
from pathlib import Path

from scripts.public_boundary import build_input_errors, scan_files


class PublicBoundaryTest(unittest.TestCase):
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
