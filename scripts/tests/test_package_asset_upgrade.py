import importlib.util
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import Mock

SPEC = importlib.util.spec_from_file_location("package_asset_upgrade", Path(__file__).resolve().parents[1] / "package_asset_upgrade.py")
ASSETS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ASSETS)
ID = "12345678-1234-4234-8234-123456789abc"


class PackageAssetUpgradeTests(unittest.TestCase):
    def saved(self):
        return {"vendor": ID, "intent": ID, "snapshot": "original",
                "input": {"organization_id": ID, "project_id": ID, "name": "Character", "description": "Original"}}

    def responses(self, dispatch=None, qualifications=None):
        return [(200, {"data": {"configured": True, "revision": 1}}),
                (200, {"data": {"status": "prepared", "request": {"name": "Character", "description": "Original"}, "dispatch": dispatch}}),
                (200, {"data": [] if qualifications is None else qualifications})]

    def test_changed_original_bindings_fail_before_any_request(self):
        request = Mock()
        with self.assertRaisesRegex(AssertionError, "changed original"):
            ASSETS.assert_asset_upgrade(request, Mock(return_value="changed"), self.saved())
        request.assert_not_called()

    def test_fabricated_qualification_and_dispatch_fail_before_post(self):
        for dispatch, qualifications in [({"outcome": "succeeded"}, None), (None, [{"id": ID}])]:
            with self.subTest(dispatch=dispatch, qualifications=qualifications):
                request = Mock(side_effect=self.responses(dispatch, qualifications))
                with self.assertRaisesRegex(AssertionError, "fabricated"):
                    ASSETS.assert_asset_upgrade(request, Mock(return_value="original"), self.saved())
                self.assertTrue(all(call.args[0] == "GET" for call in request.call_args_list))

    def test_unqualified_acceptance_and_mutating_rejection_fail(self):
        request = Mock(side_effect=self.responses() + [(202, {"data": {"status": "dispatching"}})])
        with self.assertRaisesRegex(AssertionError, "allowed unqualified"):
            ASSETS.assert_asset_upgrade(request, Mock(return_value="original"), self.saved())
        error = urllib.error.HTTPError("https://fixture.invalid", 409, "Conflict", {}, None)
        request = Mock(side_effect=self.responses() + [error])
        with self.assertRaisesRegex(AssertionError, "mutated"):
            ASSETS.assert_asset_upgrade(request, Mock(side_effect=["original", "changed"]), self.saved())

    def test_rejected_request_with_receipt_fails(self):
        error = urllib.error.HTTPError("https://fixture.invalid", 409, "Conflict", {}, None)
        request = Mock(side_effect=self.responses() + [error])
        with self.assertRaises(AssertionError):
            ASSETS.assert_asset_upgrade(request, Mock(side_effect=["original", "original", "1"]), self.saved())

    def test_sql_routing_identifiers_are_validated(self):
        with self.assertRaises(ValueError):
            ASSETS.asset_snapshot(Mock(), "not-a-routing-identifier", ID)


if __name__ == "__main__":
    unittest.main()
