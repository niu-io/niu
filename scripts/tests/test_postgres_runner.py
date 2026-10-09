import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

RUNNER = Path(__file__).resolve().parents[1] / 'test-postgres.py'


class PostgresRunnerTests(unittest.TestCase):
    def run_fixture(self, match, startup_failure=False, cluster_running=True, target=None, execution_output=None):
        with tempfile.TemporaryDirectory(prefix='niu-runner-fixture-') as directory:
            root = Path(directory)
            code = '''#!/usr/bin/env python3
import hashlib, json, os, pathlib, sys
root = pathlib.Path(__file__).resolve().parent
name = pathlib.Path(sys.argv[0]).name
with (root / 'calls.jsonl').open('a') as output:
    output.write(json.dumps({'name': name, 'args': sys.argv[1:],
        'inherits_credentials': any(key in os.environ for key in ['NIU_ADMIN_TOKENS', 'NIU_VENDOR_ENCRYPTION_KEY']),
        'build_environment': hashlib.sha256(json.dumps([os.environ.get('DATABASE_URL'), os.environ.get('NIU_IMAGE_STORAGE_TEST_KEY')]).encode()).hexdigest(),
        'inherits_database': os.environ.get('DATABASE_URL') == 'postgres://fixture-production/db'}) + '\\n')
if name == 'cargo' and '--list' in sys.argv:
    print('fixture: test' if 'matching' in sys.argv else '0 tests, 0 benchmarks')
if name == 'cargo' and '--list' not in sys.argv:
    receipt = root / 'execution-output'
    if receipt.exists():
        print(receipt.read_text())
        sys.exit(0)
    sys.exit(17)
if name == 'pg_ctl' and sys.argv[-1] == 'status' and (root / 'not-running').exists():
    sys.exit(3)
if name == 'pg_ctl' and sys.argv[-1] == 'start' and (root / 'fail-start').exists():
    sys.exit(1)
'''
            if execution_output is not None:
                (root / 'execution-output').write_text(execution_output)
            if not cluster_running:
                (root / 'not-running').touch()
            if startup_failure:
                (root / 'fail-start').touch()
            for name in ('cargo', 'initdb', 'pg_ctl'):
                executable = root / name
                executable.write_text(code)
                executable.chmod(0o700)
            environment = dict(os.environ, PATH=str(root) + os.pathsep + os.environ['PATH'],
                               NIU_ADMIN_TOKENS='fixture-not-forwarded',
                               NIU_VENDOR_ENCRYPTION_KEY='fixture-not-forwarded',
                               DATABASE_URL='postgres://fixture-production/db')
            command = [sys.executable, str(RUNNER), match]
            if target:
                command += ['--test', target]
            result = subprocess.run(command, env=environment,
                                    text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            calls = [json.loads(line) for line in (root / 'calls.jsonl').read_text().splitlines()]
            return result, calls

    def test_no_match_fails_before_creating_a_database(self):
        result, calls = self.run_fixture('missing')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('No ignored tests match', result.stderr)
        self.assertEqual([call['name'] for call in calls], ['cargo'])

    def test_disappearing_test_is_not_a_pass_and_cluster_is_stopped(self):
        for output in ['', 'test result: ok. 0 passed; 0 failed; 0 ignored; 14 filtered out',
                       'test result: ok. 0 passed; 0 failed; 1 ignored; 0 filtered out']:
            with self.subTest(output=output):
                result, calls = self.run_fixture('matching', execution_output=output)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('No PostgreSQL tests executed', result.stderr)
                self.assertEqual([call['args'][-1] for call in calls if call['name'] == 'pg_ctl'],
                                 ['start', 'status', 'stop'])

    def test_nonempty_test_receipt_is_required_across_multiple_targets(self):
        output = ('test result: ok. 0 passed; 0 failed; 0 ignored; 9 filtered out\n'
                  'test result: ok. 2 passed; 0 failed; 0 ignored; 3 filtered out\n')
        result, calls = self.run_fixture('matching', execution_output=output)
        self.assertEqual(result.returncode, 0)
        self.assertIn('2 passed', result.stdout)
        self.assertEqual([call['args'][-1] for call in calls if call['name'] == 'pg_ctl'],
                         ['start', 'status', 'stop'])

    def test_failed_test_stops_only_its_owned_cluster_without_inheriting_credentials(self):
        result, calls = self.run_fixture('matching')
        self.assertEqual(result.returncode, 17)
        self.assertTrue(all(not call['inherits_credentials'] and not call['inherits_database'] for call in calls))
        cluster_calls = [call for call in calls if call['name'] == 'pg_ctl']
        self.assertEqual(len(cluster_calls), 3)
        self.assertEqual(cluster_calls[0]['args'][1], cluster_calls[2]['args'][1])
        self.assertEqual(cluster_calls[0]['args'][-1], 'start')
        self.assertEqual(cluster_calls[1]['args'][-1], 'status')
        self.assertEqual(cluster_calls[2]['args'][-1], 'stop')

    def test_failed_startup_still_stops_a_launched_cluster(self):
        result, calls = self.run_fixture('matching', startup_failure=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual([call['args'][-1] for call in calls if call['name'] == 'pg_ctl'],
                         ['start', 'status', 'stop'])
        self.assertEqual(len([call for call in calls if call['name'] == 'cargo']), 1)

    def test_failed_startup_without_a_running_cluster_does_not_issue_stop(self):
        result, calls = self.run_fixture('matching', startup_failure=True, cluster_running=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual([call['args'][-1] for call in calls if call['name'] == 'pg_ctl'],
                         ['start', 'status'])

    def test_selected_integration_target_is_used_for_listing_and_execution(self):
        result, calls = self.run_fixture('matching', target='image_processing')
        self.assertEqual(result.returncode, 17)
        cargo_calls = [call for call in calls if call['name'] == 'cargo']
        self.assertEqual(len(cargo_calls), 2)
        for call in cargo_calls:
            self.assertEqual(call['args'][call['args'].index('--test') + 1], 'image_processing')

    def test_discovery_and_execution_keep_the_same_isolated_build_environment(self):
        result, calls = self.run_fixture('matching')
        self.assertEqual(result.returncode, 17)
        cargo_calls = [call for call in calls if call['name'] == 'cargo']
        self.assertEqual(len(cargo_calls), 2)
        self.assertEqual(cargo_calls[0]['build_environment'], cargo_calls[1]['build_environment'])
        self.assertEqual(calls[0]['name'], 'cargo')
        self.assertEqual(calls[1]['name'], 'initdb')


if __name__ == '__main__':
    unittest.main()
