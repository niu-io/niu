import importlib.util
from pathlib import Path
import unittest
import urllib.error
import uuid
from unittest.mock import Mock

SPEC = importlib.util.spec_from_file_location('package_updates', Path(__file__).resolve().parents[1] / 'package_asset_updates.py')
UPDATES = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(UPDATES)


class UpdateRecoveryTests(unittest.TestCase):
    def saved(self):
        return {'update': str(uuid.uuid4()), 'organization_id': str(uuid.uuid4()),
                'project_id': str(uuid.uuid4()), 'base': '/admin/fixture',
                'status': 'uncertain', 'snapshot': 'original'}

    def test_snapshot_change_stops_before_http(self):
        request = Mock()
        with self.assertRaisesRegex(AssertionError, 'audit changed'):
            UPDATES.assert_update_fixture(request, Mock(return_value='changed'), self.saved())
        request.assert_not_called()

    def test_audit_requires_hold_and_credential_failure(self):
        saved = self.saved()
        row = {'update_id': saved['update'], 'status': 'uncertain', 'patch_status': 'retained',
               'reconciliation_required': True, 'reason': 'invalid_configuration',
               'duration_ms': 0, 'completed_at': '2026-10-08T00:00:00Z'}
        UPDATES.assert_update_fixture(Mock(return_value=(200, {'data': [row]})), Mock(return_value='original'), saved)
        for field, value in [('reason', 'transport'), ('reconciliation_required', False),
                             ('duration_ms', -1), ('patch_status', 'erased')]:
            with self.assertRaises(AssertionError):
                UPDATES.assert_update_fixture(Mock(return_value=(200, {'data': [dict(row, **{field: value})]})), Mock(return_value='original'), saved)

    def test_replay_requires_conflict_and_never_retries(self):
        saved = self.saved()
        request = Mock(side_effect=urllib.error.HTTPError('http://fixture', 409, 'conflict', None, None))
        UPDATES.assert_update_replay_denied(request, saved)
        request.assert_called_once()
        for status in [200, 503]:
            with self.assertRaises(AssertionError):
                UPDATES.assert_update_replay_denied(Mock(return_value=(status, {})), saved)

    def test_identity_is_validated_before_sql(self):
        database = Mock()
        with self.assertRaises(ValueError):
            UPDATES.update_snapshot(database, "invalid' SQL")
        database.assert_not_called()

    def test_fixture_credential_cannot_reach_signer(self):
        database = Mock(side_effect=lambda statement: '2' if 'max(revision)' in statement else 'original')
        request = Mock(return_value=(201, {'data': {'prepared': True}}))
        listing = dict(zip(['vendor', 'intent', 'organization', 'workspace', 'root'], [str(uuid.uuid4()) for _ in range(5)]))
        UPDATES.prepare_update_fixture(request, database, listing)
        statements = [call.args[0] for call in database.call_args_list]
        credential = next(sql for sql in statements if sql.startswith('INSERT INTO vendor_asset_management_credentials'))
        self.assertIn("decode(repeat('00',48),'hex')", credential)
        self.assertEqual(request.call_count, 1)
        self.assertNotIn('/dispatch', request.call_args.args[1])


if __name__ == '__main__':
    unittest.main()
