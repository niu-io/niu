import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('native_cleanup', Path(__file__).parents[1] / 'native_cleanup.py')
cleanup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleanup)


class CleanupTests(unittest.TestCase):
    def test_failed_readiness_still_stops_owned_cluster(self):
        with patch.object(cleanup.subprocess, 'run', side_effect=[Mock(returncode=0), Mock(returncode=0)]) as run:
            cleanup.stop_postgres(Path('/disposable/cluster'))
        self.assertEqual(run.call_args_list[0].args[0], ['pg_ctl', '-D', '/disposable/cluster', 'status'])
        self.assertEqual(run.call_args_list[1].args[0], ['pg_ctl', '-D', '/disposable/cluster', '-m', 'fast', '-w', 'stop'])

    def test_absent_cluster_never_stops_another_server(self):
        with patch.object(cleanup.subprocess, 'run', return_value=Mock(returncode=3)) as run:
            cleanup.stop_postgres(Path('/disposable/cluster'))
        self.assertEqual(run.call_count, 1)

    def test_unresponsive_fixture_is_killed_and_reaped(self):
        process = Mock()
        process.poll.return_value = None
        process.wait.side_effect = [subprocess.TimeoutExpired('fixture', 5), 0]
        cleanup.stop_process(process)
        process.terminate.assert_called_once()
        process.kill.assert_called_once()
        self.assertEqual(process.wait.call_count, 2)

    def test_completed_fixture_is_untouched(self):
        process = Mock()
        process.poll.return_value = 0
        cleanup.stop_process(process)
        process.terminate.assert_not_called()


if __name__ == '__main__':
    unittest.main()
