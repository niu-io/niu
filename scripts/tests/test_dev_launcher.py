import importlib.util
import tempfile
import unittest
from pathlib import Path


SPEC = importlib.util.spec_from_file_location(
    "niu_dev_launcher", Path(__file__).resolve().parents[1] / "dev.py"
)
LAUNCHER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LAUNCHER)


class DevLauncherConfigTest(unittest.TestCase):
    def test_new_state_is_durable_without_silently_abandoning_legacy_data(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory) / 'home'
            legacy = Path(directory) / 'legacy'
            durable = home / '.local' / 'state' / 'niu' / 'dev'
            self.assertEqual(LAUNCHER.development_state(home, legacy), durable)
            legacy.mkdir()
            self.assertEqual(LAUNCHER.development_state(home, legacy), legacy)
            durable.mkdir(parents=True)
            self.assertEqual(LAUNCHER.development_state(home, legacy), durable)
    def test_incomplete_cluster_does_not_replace_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            (state / 'postgres').mkdir()
            (state / 'postgres' / 'retained-data').write_text('saved')
            (state / 'postgres.password').write_text('saved-password')
            original = LAUNCHER.STATE
            try:
                LAUNCHER.STATE = state
                with self.assertRaisesRegex(RuntimeError, 'incomplete'):
                    LAUNCHER.load_runtime_secrets({})
                self.assertFalse((state / 'secrets.json').exists())
                self.assertEqual((state / 'postgres.password').read_text(), 'saved-password')
            finally:
                LAUNCHER.STATE = original

    def test_existing_database_recovers_identity_without_rotating_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            (state / 'postgres').mkdir()
            (state / 'postgres' / 'PG_VERSION').write_text('17')
            (state / 'postgres.password').write_text('saved-postgres')
            original = LAUNCHER.STATE
            try:
                LAUNCHER.STATE = state
                config = {'NIU_DATABASE_URL': 'postgres://niu_dev_core:saved%2Dcore@127.0.0.1:55433/niu_dev_core', 'NIU_ADMIN_TOKENS': 'saved-admin', 'NIU_VENDOR_ENCRYPTION_KEY': 'saved-encryption'}
                values = LAUNCHER.load_runtime_secrets(config)
                self.assertEqual(values, {'postgres': 'saved-postgres', 'core': 'saved-core', 'admin': 'saved-admin', 'encryption': 'saved-encryption'})
                self.assertEqual(LAUNCHER.load_runtime_secrets({}), values)
                self.assertEqual((state / 'secrets.json').stat().st_mode & 0o777, 0o600)
            finally:
                LAUNCHER.STATE = original

    def test_existing_database_without_credentials_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            (state / 'postgres').mkdir()
            (state / 'postgres' / 'PG_VERSION').write_text('17')
            original = LAUNCHER.STATE
            try:
                LAUNCHER.STATE = state
                with self.assertRaisesRegex(RuntimeError, 'preserved'):
                    LAUNCHER.load_runtime_secrets({})
                self.assertFalse((state / 'secrets.json').exists())
                self.assertEqual((state / 'postgres' / 'PG_VERSION').read_text(), '17')
            finally:
                LAUNCHER.STATE = original

    def test_reads_private_dashboard_credentials_from_literal_env_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env").write_text(
                "NIU_DEV_USERNAME=demo@example.test\n"
                "NIU_DEV_PASSWORD='local test password'\n"
                "NIU_ZHIFUX_CONFIG_FILE='/private/payments/zhifux.json'\n"
                "NIU_ZHIFUX_SECRET=ignored\n"
                "NIU_UNKNOWN=ignored\n",
                encoding="utf-8",
            )
            original_root = LAUNCHER.ROOT
            try:
                LAUNCHER.ROOT = root
                config = LAUNCHER.load_local_env()
            finally:
                LAUNCHER.ROOT = original_root

        self.assertEqual(config["NIU_DEV_USERNAME"], "demo@example.test")
        self.assertEqual(config["NIU_DEV_PASSWORD"], "local test password")
        self.assertNotIn("NIU_UNKNOWN", config)
        self.assertEqual(config["NIU_ZHIFUX_CONFIG_FILE"], "/private/payments/zhifux.json")
        self.assertNotIn("NIU_ZHIFUX_SECRET", config)


if __name__ == "__main__":
    unittest.main()
