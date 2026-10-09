import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    'package_migration_checksums', Path(__file__).resolve().parents[1] / 'package-smoke.py'
)
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class PackagedMigrationChecksums(unittest.TestCase):
    def test_matching_versions_cannot_hide_changed_migration_contents(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            migrations = root / 'crates/storage/migrations'
            migrations.mkdir(parents=True)
            source = b'SELECT 1;\n'
            migration = migrations / '0001_fixture.sql'
            migration.write_bytes(source)
            receipt = '1:' + hashlib.sha384(source).hexdigest()
            with patch.object(smoke, 'ROOT', root), patch.object(
                smoke, 'database_value', side_effect=['1', '0', receipt]
            ):
                smoke.assert_packaged_migration_history()
            migration.write_bytes(b'SELECT 2;\n')
            with patch.object(smoke, 'ROOT', root), patch.object(
                smoke, 'database_value', side_effect=['1', '0', receipt]
            ):
                with self.assertRaisesRegex(AssertionError, 'checksums'):
                    smoke.assert_packaged_migration_history()


if __name__ == '__main__':
    unittest.main()
