import importlib.util
import hashlib
import unittest
import sqlite3
import tempfile
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('package_prepaid_smoke', Path(__file__).resolve().parents[1] / 'package-smoke.py')
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)

class PrepaidPackageAssertions(unittest.TestCase):
    def test_packaged_schema_requires_complete_successful_source_history(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            migrations = root / 'crates/storage/migrations'
            migrations.mkdir(parents=True)
            (migrations / '0001_first.sql').write_text('SELECT 1;')
            (migrations / '0003_next.sql').write_text('SELECT 1;')
            for applied, failed in [('1', '0'), ('1,3,4', '0'), ('1,3', '1')]:
                with self.subTest(applied=applied, failed=failed), \
                     patch.object(smoke, 'ROOT', root), \
                     patch.object(smoke, 'database_value', side_effect=[applied, failed]):
                    with self.assertRaises(AssertionError):
                        smoke.assert_packaged_migration_history()
            digest = hashlib.sha384(b'SELECT 1;').hexdigest()
            with patch.object(smoke, 'ROOT', root), \
                 patch.object(smoke, 'database_value', side_effect=['1,3', '0', f'1:{digest}\n3:{digest}']):
                smoke.assert_packaged_migration_history()

    def test_restore_rejects_changed_records_even_when_organization_survives(self):
        original = {'tables': {'organizations': {'count': '1', 'digest': 'original'}}, 'sequences': {'fixture': {'last_value': '42', 'is_called': True}}}
        for restored in [{}, {**original, 'tables': {}}, {**original, 'sequences': {'fixture': {'last_value': '1', 'is_called': False}}}]:
            with self.subTest(restored=restored), \
                 patch.object(smoke, 'database_fingerprints', side_effect=[original, restored]), \
                 patch.object(smoke.subprocess, 'run') as run, \
                 patch.object(smoke, 'docker', side_effect=['', '1']):
                run.return_value.stdout = b'fixture dump'
                with self.assertRaisesRegex(AssertionError, 'differs'):
                    smoke.restore_database_copy('00000000-0000-4000-8000-000000000001')

    def test_verified_restore_becomes_application_database(self):
        original = {'tables': {'organizations': {'count': '1', 'digest': 'same'}}, 'sequences': {}}
        with patch.object(smoke, 'database_fingerprints', side_effect=[original, original]), \
             patch.object(smoke.subprocess, 'run') as run, \
             patch.object(smoke, 'docker', side_effect=['', '1', '']) as docker:
            run.return_value.stdout = b'fixture dump'
            smoke.restore_database_copy('00000000-0000-4000-8000-000000000001')
        promotion = docker.call_args_list[-1].args
        self.assertIn('postgres', promotion)
        self.assertRegex(promotion[-1], r'\ABEGIN; ALTER DATABASE niu RENAME TO niu_backup_source_[0-9a-f]{32}; ALTER DATABASE niu_restore_test RENAME TO niu; COMMIT;\Z')

    def test_backup_failure_restarts_application_before_propagating_error(self):
        with patch.object(smoke, 'COMPOSE_MODE', False), \
             patch.object(smoke, 'docker') as docker, \
             patch.object(smoke, 'restore_database_copy', side_effect=RuntimeError('fixture failure')), \
             patch.object(smoke, 'wait_for_application') as ready:
            with self.assertRaisesRegex(RuntimeError, 'fixture failure'):
                smoke.verify_backup_restore('00000000-0000-4000-8000-000000000001')
            self.assertEqual(docker.call_args_list[0].args, ('stop', '--time', '10', smoke.APP))
            self.assertEqual(docker.call_args_list[1].args, ('start', smoke.APP))
            ready.assert_called_once()

    def verify(self, charges, balance='90', reserved='0', database='1'):
        entries = [{'currency':'USD','kind':'funding','amount_nanos':'100'}] + [{'currency':'USD', **charge} for charge in charges]
        responses = [(200, {'data':[{'currency':'USD','balance_nanos':balance,'available_nanos':balance,'reserved_nanos':reserved}]}, ''),
                     (200, {'data':entries}, '')]
        with patch.object(smoke, 'request', side_effect=responses), patch.object(smoke, 'database_value', return_value=database):
            smoke.assert_prepaid_reconciled('00000000-0000-4000-8000-000000000001',['00000000-0000-4000-8000-000000000002'])

    def test_reconciled_charge_passes(self):
        self.verify([{'currency':'USD','kind':'charge','amount_nanos':'-10'}])

    def test_missing_charge_or_wrong_balance_cannot_pass(self):
        for charges,balance in [([], '100'), ([{'currency':'USD','kind':'charge','amount_nanos':'-10'}], '100')]:
            with self.subTest(charges=charges,balance=balance), self.assertRaises(AssertionError):
                self.verify(charges,balance)

    def test_retained_hold_or_mismatched_customer_charge_cannot_pass(self):
        for reserved,database in [('5','1'), ('0','0')]:
            with self.subTest(reserved=reserved,database=database), self.assertRaises(AssertionError):
                self.verify([{'currency':'USD','kind':'charge','amount_nanos':'-10'}], reserved=reserved,database=database)


    def test_customer_activity_debit_query_enforces_currency_and_tenant_identity(self):
        connection = sqlite3.connect(':memory:')
        self.addCleanup(connection.close)
        connection.executescript("""
            CREATE TABLE customer_activity_charges (organization_id TEXT, project_id TEXT,
                attempt_id TEXT, currency TEXT, amount_nanos INTEGER);
            CREATE TABLE customer_balance_entries (organization_id TEXT, project_id TEXT,
                attempt_id TEXT, currency TEXT, kind TEXT, amount_nanos INTEGER);
            INSERT INTO customer_activity_charges VALUES
                ('00000000-0000-4000-8000-000000000001','workspace','00000000-0000-4000-8000-000000000002','CNY',10);
        """)
        responses = [(200, {'data':[{'currency':'USD','balance_nanos':'90','available_nanos':'90','reserved_nanos':'0'}]}, ''),
                     (200, {'data':[{'currency':'USD','kind':'funding','amount_nanos':'100'},
                                   {'currency':'USD','kind':'charge','amount_nanos':'-10'}]}, '')]
        for organization, workspace, currency, kind, valid in [
            ('00000000-0000-4000-8000-000000000001','workspace','USD','charge',False),
            ('other-org','workspace','CNY','charge',False),
            ('00000000-0000-4000-8000-000000000001','other-workspace','CNY','charge',False),
            ('00000000-0000-4000-8000-000000000001','workspace','CNY','refund',False),
            ('00000000-0000-4000-8000-000000000001','workspace','CNY','charge',True),
        ]:
            connection.execute('DELETE FROM customer_balance_entries')
            connection.execute('INSERT INTO customer_balance_entries VALUES (?,?,?,?,?,?)',
                (organization,workspace,'00000000-0000-4000-8000-000000000002',currency,kind,-10))
            with self.subTest(currency=currency,organization=organization,workspace=workspace,kind=kind), \
                 patch.object(smoke,'request',side_effect=responses), \
                 patch.object(smoke,'database_value',side_effect=lambda query: str(connection.execute(query).fetchone()[0])):
                if valid:
                    smoke.assert_prepaid_reconciled('00000000-0000-4000-8000-000000000001',['00000000-0000-4000-8000-000000000002'])
                else:
                    with self.assertRaisesRegex(AssertionError,'exact scoped ledger debit'):
                        smoke.assert_prepaid_reconciled('00000000-0000-4000-8000-000000000001',['00000000-0000-4000-8000-000000000002'])


    def test_invalid_references_and_duplicate_attempts_stop_before_io(self):
        organization = '00000000-0000-4000-8000-000000000001'
        attempt = '00000000-0000-4000-8000-000000000002'
        for owner, attempts in [("bad' SQL", [attempt]), (organization, ["bad' SQL"]),
                                (organization, [attempt, attempt])]:
            with self.subTest(owner=owner, attempts=attempts), \
                 patch.object(smoke, 'request') as request, \
                 patch.object(smoke, 'database_value') as database:
                with self.assertRaises((ValueError, AssertionError)):
                    smoke.assert_prepaid_reconciled(owner, attempts)
                request.assert_not_called()
                database.assert_not_called()


    def test_error_responses_and_incomplete_history_cannot_pass(self):
        account = {'data':[{'currency':'USD','balance_nanos':'90','available_nanos':'90','reserved_nanos':'0'}]}
        entries = {'data':[{'currency':'USD','kind':'funding','amount_nanos':'100'}, {'currency':'USD','kind':'charge','amount_nanos':'-10'}]}
        for balance_status, transaction_status, history in [
            (500,200,entries), (200,403,entries),
            (200,200,{**entries,'next_cursor':'another-page'}),
            (200,200,{**entries,'has_more':True}),
        ]:
            with self.subTest(balance_status=balance_status,transaction_status=transaction_status,history=history), \
                 patch.object(smoke,'request',side_effect=[(balance_status,account,''),(transaction_status,history,'')]), \
                 patch.object(smoke,'database_value') as database:
                with self.assertRaises(AssertionError):
                    smoke.assert_prepaid_reconciled('00000000-0000-4000-8000-000000000001',
                        ['00000000-0000-4000-8000-000000000002'])
                database.assert_not_called()


    def test_equal_numeric_amounts_do_not_reconcile_different_currencies(self):
        with self.assertRaisesRegex(AssertionError, 'mixed-currency'):
            self.verify([{'currency':'CNY','kind':'charge','amount_nanos':'-10'}])
