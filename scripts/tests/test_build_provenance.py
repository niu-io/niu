"""Gateway provenance watches must ignore unrelated local Git references."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


class BuildProvenanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.artifacts = tempfile.TemporaryDirectory(prefix='niu-provenance-build-')
        cls.binary = Path(cls.artifacts.name) / 'build-script'
        source = Path(__file__).resolve().parents[2] / 'apps/gateway/build.rs'
        subprocess.run([shutil.which('rustc'), '--edition=2024', str(source), '-o', str(cls.binary)], check=True)

    @classmethod
    def tearDownClass(cls):
        cls.artifacts.cleanup()

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='niu-provenance-repo-')
        self.addCleanup(self.directory.cleanup)
        self.repo = Path(self.directory.name).resolve()
        self.env = {'PATH': os.environ['PATH'], 'CARGO_PKG_VERSION': '0.0.0'}
        self.git('init', '-q', '-b', 'main')
        self.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
                 'commit', '-q', '--allow-empty', '-m', 'fixture')

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.repo, env=self.env, text=True).strip()

    def watches(self, cwd=None):
        cwd = cwd or self.repo
        output = subprocess.check_output([self.binary], cwd=cwd, env=self.env, text=True)
        prefix = 'cargo:rerun-if-changed='
        return {(cwd / line[len(prefix):]).resolve() for line in output.splitlines() if line.startswith(prefix)}

    def test_loose_branch_ignores_checkpoint_refs(self):
        expected = {self.repo / '.git/HEAD', self.repo / '.git/refs/heads/main'}
        self.assertEqual(self.watches(), expected)
        self.git('update-ref', 'refs/codex/fixture', 'HEAD')
        self.assertEqual(self.watches(), expected)

    def test_packed_branch_can_become_loose_and_detached_head_has_no_branch_watch(self):
        self.git('pack-refs', '--all', '--prune')
        self.assertEqual(self.watches(), {self.repo / '.git/HEAD', self.repo / '.git/packed-refs', self.repo / '.git/refs/heads'})
        self.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
                 'commit', '-q', '--allow-empty', '-m', 'advance')
        self.assertIn(self.repo / '.git/refs/heads/main', self.watches())
        self.git('checkout', '-q', '--detach', 'HEAD')
        self.assertEqual(self.watches(), {self.repo / '.git/HEAD', self.repo / '.git/packed-refs'})

    def test_linked_worktree_watches_its_head_and_shared_branch(self):
        linked = self.repo / 'linked'
        self.git('worktree', 'add', '-q', '-b', 'linked', str(linked))
        self.assertEqual(self.watches(linked), {self.repo / '.git/worktrees/linked/HEAD', self.repo / '.git/refs/heads/linked'})


if __name__ == '__main__':
    unittest.main()
