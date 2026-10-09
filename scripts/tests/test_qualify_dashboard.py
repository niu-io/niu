import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('qualify_dashboard', Path(__file__).parents[1] / 'qualify-dashboard.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DashboardSnapshotTests(unittest.TestCase):
    def fixture(self, root):
        repo = root / 'repo'
        for name in module.DIRECTORIES:
            directory = repo / name
            directory.mkdir(parents=True)
            (directory / 'fixture.ts').write_text('export const fixture = 1;')
        for name in module.FILES:
            path = repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('{}')
        for name in module.DEPENDENCIES:
            (repo / name).mkdir(parents=True, exist_ok=True)
        for name in ['apps/dashboard/node_modules/vitest/vitest.mjs', 'apps/dashboard/node_modules/typescript/bin/tsc', 'node_modules/.modules.yaml']:
            path = repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('fixture')
        return repo

    def test_capture_excludes_dev_secrets_and_remains_independent_of_source_edits(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            repo = self.fixture(root)
            (repo / 'apps/dashboard/.env.local').write_text('private fixture')
            target = root / 'snapshot'
            target.mkdir()
            manifest = module.capture(repo, target)
            self.assertFalse((target / 'apps/dashboard/.env.local').exists())
            for shared_css in ('branding/tokens.css', 'branding/product-rail.css'):
                self.assertIn(shared_css, manifest)
                (target / shared_css).write_text('changed shared theme')
                self.assertIn(shared_css, module.changed_inputs(target, manifest))
                (target / shared_css).write_bytes((repo / shared_css).read_bytes())
            (repo / 'apps/dashboard/src/fixture.ts').write_text('changed original')
            self.assertEqual(module.changed_inputs(target, manifest), [])
            (target / 'apps/dashboard/src/fixture.ts').write_text('changed captured input')
            self.assertEqual(module.changed_inputs(target, manifest), ['apps/dashboard/src/fixture.ts'])

    def test_branded_link_becomes_copied_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            repo = self.fixture(root)
            (repo / 'apps/dashboard/public/logo').symlink_to(repo / 'branding/assets/fixture.ts')
            target = root / 'snapshot'
            target.mkdir()
            module.capture(repo, target)
            self.assertFalse((target / 'apps/dashboard/public/logo').is_symlink())
            self.assertEqual((target / 'apps/dashboard/public/logo').read_text(), 'export const fixture = 1;')

    def test_unapproved_source_link_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            repo = self.fixture(root)
            outside = root / 'private'
            outside.write_text('private fixture')
            (repo / 'apps/dashboard/src/private').symlink_to(outside)
            target = root / 'snapshot'
            target.mkdir()
            with self.assertRaisesRegex(RuntimeError, 'branded assets'):
                module.capture(repo, target)

    def run_qualification(self, mutation=None, code=0):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            repo = self.fixture(root)
            commands = []
            def execute(command, **kwargs):
                commands.append(command)
                self.assertNotIn('NIU_PRIVATE_FIXTURE', kwargs['env'])
                if mutation:
                    mutation(repo, kwargs['cwd'])
                return subprocess.CompletedProcess(command, code)
            with patch.object(module.shutil, 'which', return_value='/fixture/node'), patch.object(module.subprocess, 'run', side_effect=execute), patch.dict(module.os.environ, {'NIU_PRIVATE_FIXTURE':'private fixture'}):
                report = module.qualify(repo, root / 'output', 2)
            self.assertEqual(len(commands), 2)
            self.assertTrue(all(command[0] == '/fixture/node' for command in commands))
            self.assertTrue(commands[0][1].endswith('/vitest/vitest.mjs'))
            self.assertTrue(commands[1][1].endswith('/typescript/bin/tsc'))
            return report

    def test_qualification_uses_direct_runners_and_reports_success(self):
        self.assertTrue(self.run_qualification()['qualified_snapshot'])

    def test_changed_dependency_layout_denies_qualification(self):
        report = self.run_qualification(lambda repo, cwd: (repo / 'node_modules/.modules.yaml').write_text('changed'))
        self.assertFalse(report['dependencies_unchanged'])
        self.assertFalse(report['qualified_snapshot'])

    def test_changed_captured_source_denies_qualification(self):
        report = self.run_qualification(lambda repo, cwd: (cwd / 'src/fixture.ts').write_text('changed'))
        self.assertTrue(report['changed_snapshot_inputs'])
        self.assertFalse(report['qualified_snapshot'])

    def test_failed_command_denies_qualification(self):
        self.assertFalse(self.run_qualification(code=1)['qualified_snapshot'])


if __name__ == '__main__':
    unittest.main()
