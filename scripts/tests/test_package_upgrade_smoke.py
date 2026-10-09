import importlib.util
import unittest
from subprocess import CompletedProcess
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "package-upgrade-smoke.py"
SPEC = importlib.util.spec_from_file_location("package_upgrade_smoke", SCRIPT)
UPGRADE_SMOKE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(UPGRADE_SMOKE)


class PackageUpgradeSmokeTests(unittest.TestCase):
    def test_remote_engine_receives_config_before_application_start(self):
        with patch.object(UPGRADE_SMOKE, 'CONFIG_PATH', Path('/fixture/config.toml')), patch.object(UPGRADE_SMOKE, 'docker') as docker:
            UPGRADE_SMOKE.start_application('fixture-image')
            calls = [call.args for call in docker.call_args_list]
            self.assertEqual([call[0] for call in calls], ['create', 'cp', 'start'])
            self.assertNotIn('--volume', calls[0])
            self.assertEqual(calls[1], ('cp', '/fixture/config.toml', f'{UPGRADE_SMOKE.APP}:/app/niu-package-upgrade-smoke.toml'))
            self.assertEqual(calls[2], ('start', UPGRADE_SMOKE.APP))
        with patch.object(UPGRADE_SMOKE, 'docker') as docker:
            docker.side_effect = [None, RuntimeError('copy failed')]
            with self.assertRaisesRegex(RuntimeError, 'copy failed'):
                UPGRADE_SMOKE.start_application('fixture-image')
            self.assertEqual([call.args[0] for call in docker.call_args_list], ['create', 'cp'])

    def test_video_fixture_namespace_survives_gateway_replacement(self):
        with patch.object(UPGRADE_SMOKE, 'VIDEO_UPGRADE', True), patch.object(UPGRADE_SMOKE, 'CONFIG_PATH', Path('/fixture/config.toml')), patch.object(UPGRADE_SMOKE, 'docker') as docker:
            UPGRADE_SMOKE.start_application('fixture-image')
            create = docker.call_args_list[0].args
            self.assertEqual(create[create.index('--network') + 1], f'container:{UPGRADE_SMOKE.ANCHOR}')
            self.assertNotIn('--publish', create)

    def test_video_upgrade_checks_charge_history_and_unknown_liability(self):
        module = UPGRADE_SMOKE.PACKAGE_VIDEO
        with patch.object(module, 'assert_video_recovered') as recovered, patch.object(module, 'assert_video_activity_reconciled') as activity, patch.object(module, 'assert_replacement_rate_effective') as rate, patch.object(module, 'assert_uncertain_video_retained') as uncertain, patch.object(UPGRADE_SMOKE, 'video_counts', side_effect=[{'creates':2,'queries':3,'requests':5},{'creates':2,'queries':4,'requests':6}]):
            with self.assertRaisesRegex(AssertionError, 'contacted upstream'):
                UPGRADE_SMOKE.assert_video_upgrade({'id':'saved'}, {'id':'uncertain'})
            recovered.assert_called_once()
            activity.assert_called_once()
            rate.assert_called_once()
            uncertain.assert_called_once()

    def test_video_upgrade_rejects_replayed_generation(self):
        with patch.object(UPGRADE_SMOKE, 'docker', return_value=CompletedProcess([], 0, '{"creates":3,"queries":3,"requests":6}', '')):
            with self.assertRaisesRegex(AssertionError, 'replayed'):
                UPGRADE_SMOKE.video_counts()

    def test_upgrade_preserves_receipts_not_just_successful_version_numbers(self):
        previous = {1: '1|original-checksum|t|original-time|123'}
        UPGRADE_SMOKE.assert_receipts_preserved(previous, dict(previous), exact=True)
        UPGRADE_SMOKE.assert_receipts_preserved(previous, {**previous, 2: 'new-receipt'})
        for current in [{}, {1: '1|changed-checksum|t|original-time|123'},
                        {1: '1|original-checksum|f|original-time|123'},
                        {1: '1|original-checksum|t|changed-time|123'}]:
            with self.subTest(current=current), self.assertRaises(AssertionError):
                UPGRADE_SMOKE.assert_receipts_preserved(previous, current)
        with self.assertRaisesRegex(AssertionError, 'failed startup'):
            UPGRADE_SMOKE.assert_receipts_preserved(previous, {**previous, 2: 'new-receipt'}, exact=True)

    def test_failed_startup_uses_database_fault_evidence_without_exposing_logs(self):
        for marker, expected in [('NIU_UPGRADE_SMOKE_BLOCKED_DDL', True), ('unrelated private failure', False)]:
            with self.subTest(marker=marker), patch.object(UPGRADE_SMOKE, 'docker') as docker:
                docker.side_effect = [
                    CompletedProcess([], 0, 'exited', ''),
                    CompletedProcess([], 0, '1', ''),
                    CompletedProcess([], 0, '', marker),
                ]
                if expected:
                    UPGRADE_SMOKE.wait_for_failed_startup()
                else:
                    with self.assertRaisesRegex(RuntimeError, 'without the injected migration failure'):
                        UPGRADE_SMOKE.wait_for_failed_startup()
                self.assertEqual(docker.call_args_list[-1].args, ('logs', UPGRADE_SMOKE.DATABASE))

    def check_records(self, listed_key, models):
        organization = {"id": "fixture-organization"}
        workspace = {"id": "fixture-workspace"}
        key = {"id": "fixture-key", "token": "fixture-issued-credential"}
        responses = [
            (200, {"data": [organization]}),
            (200, {"data": [workspace]}),
            (200, {"data": [listed_key]}),
            (200, {"data": models}),
        ]
        with patch.object(UPGRADE_SMOKE, "request", side_effect=responses) as request:
            UPGRADE_SMOKE.assert_records_persist(organization, workspace, key)
            request.assert_called_with("GET", "/v1/models", token=key["token"])

    def test_upgrade_rejects_replaced_key_even_when_row_count_matches(self):
        with self.assertRaisesRegex(AssertionError, "replaced"):
            self.check_records({"id": "replacement-key", "name": "Upgrade smoke client"},
                               [{"id": "upgrade-smoke"}])

    def test_upgrade_rejects_changed_model_access(self):
        for models in [[], [{"id": "ungranted-model"}],
                       [{"id": "upgrade-smoke"}, {"id": "ungranted-model"}]]:
            with self.subTest(models=models), self.assertRaises(AssertionError):
                self.check_records({"id": "fixture-key", "name": "Upgrade smoke client"}, models)

    def test_upgrade_rejects_credentials_even_when_the_issued_token_does_not_leak(self):
        for field in ["token", "secret", "credential", "api_key", "API_KEY_HASH"]:
            with self.subTest(field=field), self.assertRaisesRegex(AssertionError, "credential fields"):
                self.check_records({"id": "fixture-key", "name": "Upgrade smoke client",
                                    "details": [{field: "different-private-value"}]},
                                   [{"id": "upgrade-smoke"}])

    def test_upgrade_verifies_original_credential_and_grant(self):
        self.check_records({"id": "fixture-key", "name": "Upgrade smoke client"},
                           [{"id": "upgrade-smoke"}])

    def test_upgrade_smoke_targets_the_latest_storage_schema(self):
        versions = UPGRADE_SMOKE.migration_versions()

        self.assertEqual(versions, sorted(set(versions)))
        self.assertGreater(versions[0], 0)
        self.assertEqual(UPGRADE_SMOKE.LATEST_MIGRATION_VERSION, versions[-1])

    def test_upgrade_smoke_skips_unallocated_migration_versions(self):
        self.assertEqual(UPGRADE_SMOKE.first_pending_migration({1, 79}, [1, 79, 81, 82]), 81)

    def test_upgrade_smoke_selects_the_first_schema_change_after_previous_package(self):
        versions = list(range(1, UPGRADE_SMOKE.LATEST_MIGRATION_VERSION + 1))

        self.assertEqual(UPGRADE_SMOKE.first_pending_migration(range(1, 24), versions), 24)
        self.assertIsNone(UPGRADE_SMOKE.first_pending_migration(versions, versions))

    def test_upgrade_smoke_checks_missing_versions_below_the_highest_receipt(self):
        self.assertEqual(UPGRADE_SMOKE.first_pending_migration({1, 3, 79}, [1, 2, 3, 79, 80]), 2)
        self.assertEqual(UPGRADE_SMOKE.first_pending_migration(set(), [1, 2]), 1)
        with self.assertRaises(RuntimeError):
            UPGRADE_SMOKE.first_pending_migration({2}, [1, 3])

    def test_upgrade_smoke_rejects_a_previous_schema_outside_current_history(self):
        versions = list(range(1, UPGRADE_SMOKE.LATEST_MIGRATION_VERSION + 1))

        with self.assertRaises(RuntimeError):
            UPGRADE_SMOKE.first_pending_migration({versions[-1] + 1}, versions)


if __name__ == "__main__":
    unittest.main()
