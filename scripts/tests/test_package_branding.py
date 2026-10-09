import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock

SPEC = importlib.util.spec_from_file_location('package_branding', Path(__file__).resolve().parents[1] / 'package_branding.py')
BRANDING = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BRANDING)


class BrandingPersistenceAssertions(unittest.TestCase):
    def test_public_and_admin_must_both_retain_exact_snapshot(self):
        expected = {'revision': '3', 'settings': {'display_name': 'Packaged deployment'}}
        saved = {'configuration': expected, 'audit': 'retained audit'}
        for changed in [dict(expected, revision='4'), dict(expected, settings={})]:
            for position in [0, 1]:
                responses = [(200, {'data': expected}, 'application/json')] * 2
                responses[position] = (200, {'data': changed}, 'application/json')
                with self.assertRaisesRegex(AssertionError, 'branding changed'):
                    BRANDING.assert_branding(Mock(side_effect=responses), Mock(return_value='retained audit'), saved)

    def test_audit_mutation_is_not_hidden_by_matching_api_reads(self):
        saved = {'configuration': {'revision': '1', 'settings': {}}, 'audit': 'original'}
        request = Mock(return_value=(200, {'data': saved['configuration']}, 'application/json'))
        with self.assertRaisesRegex(AssertionError, 'audit changed'):
            BRANDING.assert_branding(request, Mock(return_value='changed'), saved)
        self.assertEqual(request.call_count, 2)

    def test_reset_requires_public_readback_and_revision_advance(self):
        defaults = {'display_name': 'NIU.IO', 'light': {}, 'dark': {}}
        saved = {'configuration': {'revision': '4'}, 'defaults': defaults}
        reset = {'data': {'revision': '5', 'settings': defaults}}
        for invalid in [{'data': {'revision': '4', 'settings': defaults}},
                        {'data': {'revision': '5', 'settings': {}}}]:
            with self.assertRaises(AssertionError):
                BRANDING.reset_branding(Mock(return_value=(200, invalid, 'application/json')), saved)
        with self.assertRaisesRegex(AssertionError, 'did not reset'):
            BRANDING.reset_branding(Mock(side_effect=[(200, reset, ''), (200, {}, '')]), saved)


if __name__ == '__main__':
    unittest.main()
