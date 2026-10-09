import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('migration_history', Path(__file__).resolve().parents[1] / 'check-migration-history.py')
history = importlib.util.module_from_spec(spec)
spec.loader.exec_module(history)


class MigrationHistoryTests(unittest.TestCase):
    def test_new_migrations_allowed_but_released_bytes_immutable(self):
        with tempfile.TemporaryDirectory() as directory:
            previous, current = Path(directory) / 'old', Path(directory) / 'new'
            previous.mkdir()
            current.mkdir()
            old = previous / '0001_schema.sql'
            new = current / old.name
            old.write_bytes(b'SELECT 1;\n')
            new.write_bytes(old.read_bytes())
            (current / '0002_forward.sql').write_bytes(b'SELECT 2;\n')
            self.assertEqual(history.check_history(previous, current), [])
            new.write_bytes(b'SELECT 1;\r\n')
            self.assertIn('changed', history.check_history(previous, current)[0])
            new.unlink()
            self.assertIn('removed or renamed', history.check_history(previous, current)[0])

    def test_additions_must_have_unique_valid_versions(self):
        for name in ['0001_reused.sql', '0_invalid.sql', 'invalid.sql', '0004_duplicate.sql']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                previous, current = Path(directory) / 'old', Path(directory) / 'new'
                previous.mkdir()
                current.mkdir()
                for version in ['0001_schema.sql', '0003_release.sql']:
                    (previous / version).write_text('SELECT 1;')
                    (current / version).write_text('SELECT 1;')
                (current / '0004_forward.sql').write_text('SELECT 4;')
                (current / name).write_text('SELECT 5;')
                self.assertTrue(history.check_history(previous, current))

    def test_unapplied_gap_requires_runtime_upgrade_not_source_rejection(self):
        with tempfile.TemporaryDirectory() as directory:
            previous, current = Path(directory) / 'old', Path(directory) / 'new'
            previous.mkdir()
            current.mkdir()
            for name in ['0001_schema.sql', '0003_release.sql']:
                (previous / name).write_text('SELECT 1;')
                (current / name).write_text('SELECT 1;')
            (current / '0002_gap.sql').write_text('SELECT 2;')
            self.assertEqual(history.check_history(previous, current), [])

    def test_missing_previous_history_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertTrue(history.check_history(Path(directory) / 'missing', Path(directory)))
