import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
import uuid
from unittest.mock import Mock

SPEC = importlib.util.spec_from_file_location('package_asset_listing', Path(__file__).resolve().parents[1] / 'package_asset_listing.py')
LISTINGS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LISTINGS)


class PackageListingTests(unittest.TestCase):
    def saved(self):
        ids = [str(uuid.uuid4()) for _ in range(6)]
        return dict(zip(['vendor', 'intent', 'organization', 'workspace', 'root', 'child'], ids),
                    unresolved=str(uuid.uuid4()), snapshot='original', expected=[{'listing_id': ids[4]}, {'listing_id': ids[5]}])

    def test_snapshot_changes_fail_before_http(self):
        request = Mock()
        with self.assertRaisesRegex(AssertionError, 'changed'):
            LISTINGS.assert_listing_fixture(request, Mock(return_value='changed'), self.saved())
        request.assert_not_called()

    def test_encrypted_content_mismatch_is_rejected(self):
        request = Mock(return_value=(200, {'data': {}}))
        with self.assertRaisesRegex(AssertionError, 'encrypted listing recovery'):
            LISTINGS.assert_listing_fixture(request, Mock(return_value='original'), self.saved())

    def test_invalid_routing_identity_never_reaches_database(self):
        database = Mock()
        with self.assertRaises(ValueError):
            LISTINGS.listing_snapshot(database, "invalid' SQL")
        database.assert_not_called()

    def lookup_saved(self):
        saved = self.saved()
        saved['lookup'] = {'id': str(uuid.uuid4()), 'unresolved': str(uuid.uuid4()),
                           'snapshot': 'original', 'expected': {'name': 'Character', 'status': 'Processing'}}
        return saved

    def lookup_responses(self, saved):
        lookup = saved['lookup']
        return [(200, {'data': lookup['expected']}), (200, {'data': [
            {'lookup_id': lookup['id'], 'status': 'succeeded', 'asset_status': 'Processing'},
            {'lookup_id': lookup['unresolved'], 'status': 'unresolved', 'asset_status': None,
             'completed_at': None, 'duration_ms': None, 'reason': None},
        ]})]

    def test_lookup_snapshot_change_stops_before_http(self):
        request = Mock()
        with self.assertRaisesRegex(AssertionError, 'lookup audit'):
            LISTINGS.assert_lookup_fixture(request, Mock(return_value='changed'), self.lookup_saved())
        request.assert_not_called()

    def test_lookup_recovery_validates_unresolved_and_private_projection(self):
        saved = self.lookup_saved()
        request = Mock(side_effect=self.lookup_responses(saved))
        LISTINGS.assert_lookup_fixture(request, Mock(return_value='original'), saved)
        self.assertEqual(request.call_count, 2)
        for bad_field, bad_value in [('duration_ms', 0), ('reason', 'Package character private')]:
            responses = self.lookup_responses(saved)
            responses[1][1]['data'][1][bad_field] = bad_value
            with self.assertRaises(AssertionError):
                LISTINGS.assert_lookup_fixture(Mock(side_effect=responses), Mock(return_value='original'), saved)
        responses = self.lookup_responses(saved)
        responses[0] = (200, {'data': {'name': 'wrong'}})
        with self.assertRaisesRegex(AssertionError, 'encrypted lookup'):
            LISTINGS.assert_lookup_fixture(Mock(side_effect=responses), Mock(return_value='original'), saved)

    def test_lookup_identity_is_validated_before_database(self):
        database = Mock()
        with self.assertRaises(ValueError):
            LISTINGS.lookup_snapshot(database, "invalid' SQL")
        database.assert_not_called()

    def test_lookup_cipher_is_bound_to_its_separate_domain(self):
        organization, workspace, lookup = [str(uuid.uuid4()) for _ in range(3)]
        master = 'controlled-package-test-master-key-value'
        page = {'Result': {'Items': [], 'NextToken': None}}
        encrypted = LISTINGS.encrypted_page(master, organization, workspace, lookup, page, lookup=True)
        script = """
const fs=require('node:fs'),c=require('node:crypto'),v=JSON.parse(fs.readFileSync(0,'utf8')),b=Buffer.from(v.encrypted,'hex');
const d=c.createDecipheriv('aes-256-gcm',c.createHash('sha256').update(v.master).digest(),b.subarray(1,13));
const id=x=>Buffer.from(x.replaceAll('-',''),'hex');
d.setAAD(Buffer.concat([Buffer.from(v.domain),id(v.organization),id(v.workspace),id(v.lookup)]));d.setAuthTag(b.subarray(-16));
try{process.stdout.write(Buffer.concat([d.update(b.subarray(13,-16)),d.final()]));}catch{process.exit(2);}
"""
        payload = dict(master=master, organization=organization, workspace=workspace,
                       lookup=lookup, encrypted=encrypted, domain='niu.asset-lookup-result.v1')
        result = subprocess.run(['node', '-e', script], input=json.dumps(payload).encode(), capture_output=True)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout), page)
        payload['domain'] = 'niu.asset-listing-result.v1'
        result = subprocess.run(['node', '-e', script], input=json.dumps(payload).encode(), capture_output=True)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, b'')

    def test_aes_fixture_roundtrips_and_rejects_other_workspace(self):
        organization, workspace, listing = [str(uuid.uuid4()) for _ in range(3)]
        master = 'controlled-package-test-master-key-value'
        page = {'Result': {'Items': [], 'NextToken': None}}
        ciphertext = LISTINGS.encrypted_page(master, organization, workspace, listing, page)
        self.assertEqual(bytes.fromhex(ciphertext)[0], 1)
        script = """
const fs=require('node:fs'), crypto=require('node:crypto');
const v=JSON.parse(fs.readFileSync(0,'utf8')), b=Buffer.from(v.ciphertext,'hex');
const d=crypto.createDecipheriv('aes-256-gcm',crypto.createHash('sha256').update(v.master).digest(),b.subarray(1,13));
const id=x=>Buffer.from(x.replaceAll('-',''),'hex');
d.setAAD(Buffer.concat([Buffer.from('niu.asset-listing-result.v1'),id(v.organization),id(v.workspace),id(v.listing)]));
d.setAuthTag(b.subarray(b.length-16));
try { process.stdout.write(Buffer.concat([d.update(b.subarray(13,b.length-16)),d.final()])); } catch { process.exit(2); }
"""
        payload = dict(master=master, organization=organization, workspace=workspace, listing=listing, ciphertext=ciphertext)
        result = subprocess.run(['node', '-e', script], input=json.dumps(payload).encode(), capture_output=True)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout), page)
        payload['workspace'] = str(uuid.uuid4())
        result = subprocess.run(['node', '-e', script], input=json.dumps(payload).encode(), capture_output=True)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, b'')


if __name__ == '__main__':
    unittest.main()
