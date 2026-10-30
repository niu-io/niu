"""Guard operator documentation against routes and paths that do not exist."""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class OperatorDocumentationTest(unittest.TestCase):
    def test_readme_self_hosted_grant_uses_the_registered_route(self):
        readme = (ROOT / "README.md").read_text()
        self.assertNotIn("/balance/grants", readme)
        self.assertIn(
            '/api/v1/organizations/$ORG_ID/billing/accounts/USD/grants',
            readme,
        )
        grant_body = readme.split('billing/accounts/USD/grants', 1)[1].split("\n\n", 1)[0]
        self.assertIn('"amount_nanos"', grant_body)
        # Currency is a path segment and the grant input denies unknown fields.
        self.assertNotIn('"currency"', grant_body)

    def test_ci_scope_document_uses_registered_health_paths(self):
        scope = (ROOT / "docs/reference/ci-verification-scope.md").read_text()
        self.assertNotIn("/health/ready", scope)
        self.assertNotIn("/health/live", scope)
        self.assertIn("/readyz", scope)
        self.assertIn("/healthz", scope)


if __name__ == "__main__":
    unittest.main()
