"""Contract checks for synthetic package configuration; not live qualification."""
import importlib.util
import unittest
from unittest.mock import patch
from pathlib import Path

spec = importlib.util.spec_from_file_location('package_video_setup', Path(__file__).resolve().parents[1] / 'package_video.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)
ID='00000000-0000-4000-8000-000000000001'

class PackageVideoSetup(unittest.TestCase):
    def test_deferred_creation_does_not_refresh_or_resubmit(self):
        calls=[]
        def request(method,path,**options):
            calls.append((method,path))
            if path.endswith('/projects'):return 201,{'id':ID},''
            if path.endswith('/keys'):return 201,{'id':ID,'token':'synthetic'},''
            if path=='/v1/video/jobs':return 202,{'id':ID},''
            self.fail('deferred creation must not query upstream')
        video=setup.create_video(request,ID,defer_completion=True)
        self.assertEqual(video['id'],ID)
        self.assertNotIn('billing',video)
        self.assertEqual(len(calls),3)

    def test_saved_completion_only_queries_and_keeps_exact_customer_charge(self):
        calls=[]
        def request(method,path,**options):
            calls.append((method,path))
            if path.endswith('/refresh'):return 200,{'status':'succeeded'},''
            if path.endswith('/billing'):return 200,{'charge_nanos':'10','currency':'USD'},''
            self.fail('completion must not create a new job')
        video={'id':ID,'token':'synthetic'}
        setup.complete_saved_video(request,video)
        self.assertEqual(video['billing']['charge_nanos'],'10')
        self.assertEqual(calls,[('POST',f'/v1/video/jobs/{ID}/refresh'),('GET',f'/v1/video/jobs/{ID}/billing')])

    def test_result_deletion_requires_acknowledgment_and_content_free_availability(self):
        video={'id':ID,'token':'synthetic-video-client'}
        setup.assert_video_result_state(lambda *args,**kwargs:(200,{'video':'available','last_frame':'missing'},''),video)
        setup.delete_video_results(lambda *args,**kwargs:(200,{'deleted':True},''),video)
        setup.assert_video_result_state(lambda *args,**kwargs:(200,{'video':'unavailable','last_frame':'unavailable'},''),video,'unavailable')
        with self.assertRaisesRegex(AssertionError,'availability'):
            setup.assert_video_result_state(lambda *args,**kwargs:(200,{'video':'available','last_frame':'missing','url':'private'},''),video)
    def test_revoked_api_key_blocks_video_status_billing_and_refresh(self):
        video={'organization':ID,'workspace':ID,'id':ID,'key_id':ID,'token':'synthetic-video-client'}
        calls=[]
        def request(method,path,**options):
            calls.append((method,path,options))
            return (204 if method=='DELETE' else 401),{},''
        setup.revoke_video_key(request,video)
        setup.assert_revoked_video_key_denied(request,video)
        self.assertEqual(len(calls),4)
        self.assertEqual([method for method,_,_ in calls],['DELETE','GET','GET','POST'])
        self.assertTrue(all(options=={'bearer_token':'synthetic-video-client'} for _,_,options in calls[1:]))
        with self.assertRaisesRegex(AssertionError,'revoked API key'):
            setup.assert_revoked_video_key_denied(lambda *args,**kwargs:(200,{},''),video)
    def test_revoked_reader_requires_authentication_failure_for_list_and_detail(self):
        video={'organization':ID,'workspace':ID,'id':ID,'reader_id':ID,'reader_token':'synthetic-reader'}
        calls=[]
        def request(method,path,**options):
            calls.append((method,path,options))
            return (204 if method=='DELETE' else 401),{},''
        setup.revoke_video_reader(request,video)
        setup.assert_revoked_video_reader_denied(request,video)
        self.assertEqual(calls[0],('DELETE',f'/admin/v1/operators/{ID}',{'admin':True}))
        self.assertEqual(len(calls),3)
        self.assertTrue(all(options=={'bearer_token':'synthetic-reader'} for _,_,options in calls[1:]))
        with self.assertRaisesRegex(AssertionError,'revoked reader'):
            setup.assert_revoked_video_reader_denied(lambda *args,**kwargs:(200,{},''),video)
    def test_configuration_preserves_credential_scope_and_independent_customer_rates(self):
        calls=[]
        def request(method,path,**options):
            calls.append((method,path,options))
            body=options.get('payload',{})
            if path.endswith('/vendors'):
                result={'data':{'id':ID,'revision':2}}
            elif path.endswith('/models'):
                result={'data':{'revision':3}}
            elif path.endswith('/media-offers'):
                result={'data':{'revision':body['revision']}}
            elif path.endswith('/operators'):
                result={'operator':{'id':ID},'token':'synthetic-manager-token'}
            else:
                result={'data':{'id':ID}}
            return 200,result,''
        result=setup.configure_video(request,ID,'http://127.0.0.1:24678','synthetic-credential',lambda _:ID)
        self.assertEqual(result['model'],'package-video')
        writes=[options for _,path,options in calls if path.endswith('/media-rates')]
        self.assertEqual([entry['payload']['tariff']['amount_units'] for entry in writes],[100,40])
        self.assertTrue(all(entry['admin'] for entry in writes))
        activation=[options for method,_,options in calls if method=='PATCH']
        self.assertEqual(activation,[{'bearer_token':'synthetic-manager-token','payload':{'active':True}}])
        self.assertEqual(sum('synthetic-credential' in str(options) for _,_,options in calls),1)
        schema=next(options['payload']['capabilities']['video_schema'] for _,path,options in calls if path.endswith('/models'))
        self.assertEqual(set(schema['inputs']),{'text'})
        self.assertFalse(schema['callbacks_qualified'])

    def test_recovery_refreshes_without_recreating_and_rejects_historical_charge_drift(self):
        calls=[]
        states=iter(['queued','running','succeeded'])
        bill={'charge_nanos':'10','currency':'USD'}
        def request(method,path,**options):
            calls.append((method,path))
            if path.endswith('/projects'):
                return 201,{'id':ID},''
            if path.endswith('/keys'):
                return 201,{'id':ID,'token':'synthetic-video-client'},''
            if method=='POST' and path=='/v1/video/jobs':
                return 202,{'id':ID},''
            if path.endswith('/billing'):
                return 200,bill.copy(),''
            return 200,{'status':next(states)},''
        with patch.object(setup.time,'sleep'):
            video=setup.create_video(request,ID)
        self.assertEqual(sum(method=='POST' and path=='/v1/video/jobs' for method,path in calls),1)
        reads=[]
        def recovered(method,path,**options):
            reads.append(method)
            return 200, bill.copy() if path.endswith('/billing') else {'status':'succeeded'},''
        setup.assert_video_recovered(recovered,video)
        self.assertEqual(reads,['POST','GET'])
        bill['charge_nanos']='11'
        with self.assertRaisesRegex(AssertionError,'historical'):
            setup.assert_video_recovered(recovered,video)

    def test_rate_replacement_preserves_original_and_checks_future_liability(self):
        calls=[]
        original={'revision':'original','tariff':{'revision':'original-tariff','amount_units':100,'effective_from':0}}
        configuration={'endpoint':'http://127.0.0.1:24678','customer_rate':original}
        def request(method,path,**options):
            calls.append((method,path,options))
            return 200,{'maximum_charge_nanos':'200'},''
        setup.replace_fixture_customer_rate(request,ID,configuration)
        self.assertEqual(original['tariff']['amount_units'],100)
        payload=calls[0][2]['payload']
        self.assertEqual(payload['previous_revision'],'original')
        self.assertEqual(payload['rate']['tariff']['amount_units'],1000)
        self.assertTrue(calls[0][2]['admin'])
        setup.assert_replacement_rate_effective(request,{'token':'synthetic-key'})
        self.assertEqual(calls[1][2]['bearer_token'],'synthetic-key')
        for endpoint in ['https://live.example','http://credential@127.0.0.1:24678']:
            with self.assertRaises(ValueError):
                setup.replace_fixture_customer_rate(request,ID,{**configuration,'endpoint':endpoint})
        self.assertEqual(len(calls),2)

    def test_customer_logs_match_billing_and_reject_procurement_fields(self):
        video={'organization':ID,'workspace':ID,'foreign_workspace':'00000000-0000-4000-8000-000000000002','id':ID,'reader_token':'synthetic-reader','billing':{'charge_nanos':'10','currency':'USD'}}
        row={'attempt_id':ID,'request_kind':'video','customer_charge_nanos':'10','customer_charge_currency':'USD'}
        calls=[]
        def request(method,path,**options):
            calls.append(options)
            if video['foreign_workspace'] in path:return 404,{},''
            return 200,{'data':[row] if '?' in path else row},''
        setup.assert_video_activity_reconciled(request,video)
        self.assertTrue(all(options=={'bearer_token':'synthetic-reader'} for options in calls))
        row['purchase_price']='private-fixture-value'
        with self.assertRaisesRegex(AssertionError,'procurement'):
            setup.assert_video_activity_reconciled(request,video)
        row.pop('purchase_price');row['customer_charge_nanos']='11'
        with self.assertRaises(AssertionError):
            setup.assert_video_activity_reconciled(request,video)

    def test_rotation_uses_expected_revision_and_keeps_the_local_endpoint(self):
        calls=[]
        def request(method,path,**options):
            calls.append((method,path,options))
            return 200,{'data':[{'id':ID,'revision':3}]},''
        configuration={'supplier':ID,'vendor':ID,'vendor_revision':2,'endpoint':'http://127.0.0.1:24678'}
        setup.rotate_fixture_credential(request,configuration,'synthetic-replacement')
        method,path,options=calls[1]
        self.assertEqual((method,path),('PUT',f'/admin/v1/vendors/{ID}'))
        self.assertEqual(options['payload']['expected_revision'],3)
        self.assertEqual(options['payload']['api_base'],configuration['endpoint'])
        self.assertTrue(options['admin'])
        with self.assertRaises(ValueError):
            setup.rotate_fixture_credential(request,{**configuration,'endpoint':'https://live.example'},'synthetic')
        self.assertEqual(len(calls),2)

    def test_changed_credential_denial_preserves_saved_status_and_billing(self):
        video={'id':ID,'token':'synthetic-client','billing':{'charge_nanos':'10'}}
        calls=[]
        def request(method,path,**options):
            calls.append((method,path))
            if path.endswith('/refresh'):
                return 409,{},''
            return 200,video['billing'] if path.endswith('/billing') else {'status':'succeeded'},''
        setup.assert_rotated_recovery_blocked(request,video)
        self.assertEqual([method for method,_ in calls],['POST','GET','GET'])
        self.assertFalse(any(path=='/v1/video/jobs' for _,path in calls))
        with self.assertRaisesRegex(AssertionError,'changed credential'):
            setup.assert_rotated_recovery_blocked(lambda *args,**kwargs:(200,{},''),video)

    def test_uncertain_recovery_retains_hold_and_rejects_charge_or_refresh(self):
        video={'id':ID,'token':'synthetic-client','organization':ID}
        calls=[]
        balance={'currency':'USD','balance_nanos':'50000000000','reserved_nanos':'20','available_nanos':'49999999980'}
        def request(method,path,**options):
            calls.append((method,path))
            if path.endswith('/refresh'):return 409,{},''
            if path.endswith('/balance'):return 200,{'data':[balance]},''
            if path.endswith('/transactions'):return 200,{'data':[{'kind':'funding'}]},''
            return 200,{'status':'submission_unknown'},''
        setup.assert_uncertain_video_retained(request,video)
        self.assertEqual([method for method,_ in calls],['GET','GET','GET','POST'])
        self.assertFalse(any(path=='/v1/video/jobs' for _,path in calls))
        balance['reserved_nanos']='0'
        with self.assertRaisesRegex(AssertionError,'liability'):
            setup.assert_uncertain_video_retained(request,video)

    def test_nonlocal_endpoint_and_invalid_scope_fail_before_any_write(self):
        calls=[]
        request=lambda *args,**options:calls.append(args)
        for organization,endpoint in [(ID,'https://real-supplier.example'),('invalid','http://127.0.0.1:24678'),(ID,'http://credential@127.0.0.1:24678')]:
            with self.subTest(endpoint=endpoint),self.assertRaises(ValueError):
                setup.configure_video(request,organization,endpoint,'fixture',lambda _:ID)
        self.assertEqual(calls,[])

if __name__=='__main__':
    unittest.main()
