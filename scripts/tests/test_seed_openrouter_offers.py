import importlib.util
import unittest
import io
import json
from contextlib import redirect_stdout
from unittest.mock import patch
from pathlib import Path


SPEC = importlib.util.spec_from_file_location(
    'seed_openrouter_offers', Path(__file__).resolve().parents[1] / 'seed-openrouter-offers.py'
)
SEED = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SEED)


class PublicRatesTest(unittest.TestCase):
    def test_refreshes_only_provably_truncated_descriptions(self):
        upstream = dict(description='A complete model description with details.')
        existing = dict(name='Custom name', description='A complete model...', context_length=8192)
        self.assertEqual(SEED.refreshed_metadata(existing, upstream), dict(existing,
            description=upstream['description']))
        for description in ['Custom description...', 'Custom description', upstream['description'], '...']:
            custom = dict(existing, description=description)
            self.assertEqual(SEED.refreshed_metadata(custom, upstream), custom)
        self.assertEqual(SEED.refreshed_metadata(dict(description='A complete model…'), upstream)['description'],
            upstream['description'])
        self.assertEqual(SEED.refreshed_metadata(existing, dict(description='x'*12001)), existing)

    def test_descriptive_metadata_excludes_prices_and_unrelated_provider_fields(self):
        model=dict(name='Friendly model',description='Supports image reasoning.',context_length=128000,
                   top_provider=dict(max_completion_tokens=8192),
                   architecture=dict(input_modalities=['text','image'],output_modalities=['text']),
                   pricing=dict(prompt='0.00001',completion='0.00002'),api_key='private-fixture')
        self.assertEqual(SEED.descriptive_metadata(model),dict(name='Friendly model',
            description='Supports image reasoning.',context_length=128000,max_completion_tokens=8192,
            input_modalities=['text','image'],output_modalities=['text']))
        self.assertEqual(SEED.descriptive_metadata(dict(name='x'*301,context_length=True,
            architecture=dict(input_modalities=['',None,'x'*41,'text']))),
            dict(input_modalities=['text'],output_modalities=[]))

    def test_existing_offer_backfills_only_missing_metadata_with_route_revision(self):
        writes=[]
        catalog=[dict(id='test/model',name='Friendly model',context_length=8192,
                      pricing=dict(prompt='0.000000000000003',completion='0.000000000000004'))]
        fixtures={
            'https://openrouter.ai/api/v1/models':catalog,
            'http://fixture/admin/v1/providers':[dict(id='supplier',name='OpenRouter')],
            'http://fixture/admin/v1/vendors':[dict(id='vendor',name='Demo key',adapter='openrouter',revision=2)],
            'http://fixture/admin/v1/vendors/vendor/models':[dict(alias='test/model',upstream_model='test/model',
                enabled=False,public_catalog=False,revision=7,capabilities=dict(custom_feature=True))],
            'http://fixture/admin/v1/providers/supplier/administration':dict(offers=[dict(model_alias='test/model',
                currency='USD',prompt_rate='3',completion_rate='4')]),
        }
        def read(request,timeout):
            url=request if isinstance(request,str) else request.full_url
            method='GET' if isinstance(request,str) else request.get_method()
            if method!='GET':
                writes.append((url,json.loads(request.data)));value={}
            else:value=fixtures[url]
            response=io.BytesIO(json.dumps(dict(data=value)).encode());response.status=200;return response
        with patch.object(SEED,'MODELS',['test/model']),patch.object(SEED,'urlopen',read),patch.dict(SEED.os.environ,
                dict(NIU_ADMIN_TOKEN='fixture-admin',NIU_ADMIN_URL='http://fixture')),patch('sys.argv',['seed','--vendor-name','Demo key']),redirect_stdout(io.StringIO()):
            SEED.main()
        mapping=[body for url,body in writes if url.endswith('/models')]
        self.assertEqual(mapping,[dict(alias='test/model',upstream_model='test/model',enabled=False,
            public_catalog=False,expected_revision=7,capabilities=dict(custom_feature=True,catalog=dict(
                name='Friendly model',context_length=8192,input_modalities=[],output_modalities=[])))])
        self.assertFalse(any(url.endswith('/offers') for url,body in writes))

    def test_metadata_only_does_not_read_or_write_supplier_offers(self):
        writes=[]
        fixtures={
            'https://openrouter.ai/api/v1/models':[dict(id='test/model',description='Full description with details.')],
            'http://fixture/admin/v1/vendors':[dict(id='vendor',name='Demo key',adapter='openrouter')],
            'http://fixture/admin/v1/vendors/vendor/models':[dict(alias='test/model',upstream_model='test/model',
                enabled=False,public_catalog=False,revision=7,capabilities=dict(custom=True,catalog=dict(description='Full description...')))],
        }
        def read(request,timeout):
            url=request if isinstance(request,str) else request.full_url
            method='GET' if isinstance(request,str) else request.get_method()
            if method!='GET':
                self.assertEqual(url,'http://fixture/admin/v1/vendors/vendor/models')
                writes.append(json.loads(request.data));value={}
            else:value=fixtures[url]
            response=io.BytesIO(json.dumps(dict(data=value)).encode());response.status=200;return response
        with patch.object(SEED,'urlopen',read),patch.dict(SEED.os.environ,
                dict(NIU_ADMIN_TOKEN='fixture-admin',NIU_ADMIN_URL='http://fixture')),patch('sys.argv',['seed','--metadata-only']),redirect_stdout(io.StringIO()):
            SEED.main()
        self.assertEqual(len(writes),1)
        self.assertEqual(writes[0]['capabilities'],dict(custom=True,catalog=dict(description='Full description with details.')))
        self.assertEqual(writes[0]['expected_revision'],7)
        self.assertFalse(writes[0]['enabled'])
        self.assertFalse(writes[0]['public_catalog'])

    def test_multiple_credentials_require_explicit_demo_selection(self):
        vendors = [dict(id='one', name='Demo general'), dict(id='two', name='Demo restricted')]
        self.assertEqual(SEED.select_demo_vendor(vendors, 'Demo restricted'), vendors[1])
        self.assertEqual(SEED.select_demo_vendor(vendors[:1]), vendors[0])
        for name in [None, 'Missing']:
            with self.assertRaises(ValueError):
                SEED.select_demo_vendor(vendors, name)
        with self.assertRaises(ValueError):
            SEED.select_demo_vendor([vendors[0], vendors[0]], 'Demo general')

    def test_exact_conversion_and_rejection_of_unrepresentable_prices(self):
        self.assertEqual(SEED.rate('0.0000004'), '400000000')
        self.assertEqual(SEED.rate('0'), '0')
        self.assertEqual(SEED.rate('1'), '1000000000000000')
        for value in ['NaN', 'Infinity', '-1', '0.0000000000000001', '1.000000000000001']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                SEED.rate(value)

    def test_current_revision_is_opaque_and_history_is_preserved(self):
        previous = dict(model_alias='test/model', revision='9', currency='USD',
                        prompt_rate='1', completion_rate='2')
        current = dict(previous, revision='opaque-current-revision', prompt_rate='400000000',
                       completion_rate='1600000000')
        SEED.verify_existing_rates([current],
                                   {'test/model': ('400000000', '1600000000')})
        self.assertEqual(previous['prompt_rate'], '1')
        with self.assertRaises(ValueError):
            SEED.verify_existing_rates([current, previous],
                                       {'test/model': ('400000000', '1600000000')})

    def test_changed_prices_or_currency_require_review(self):
        offer = dict(model_alias='test/model', revision='1', currency='USD',
                     prompt_rate='400000000', completion_rate='1600000000')
        for changed in [dict(offer, currency='EUR'), dict(offer, prompt_rate='1'),
                        dict(offer, completion_rate='2')]:
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                SEED.verify_existing_rates([changed],
                                           {'test/model': ('400000000', '1600000000')})

    def test_refresh_is_explicit_revision_checked_and_preserves_history(self):
        offer = dict(model_alias='test/model', revision='opaque-revision', currency='USD',
                     prompt_rate='1', completion_rate='2')
        prices = {'test/model': ('3', '4')}
        with self.assertRaises(ValueError):
            SEED.plan_rate_updates([offer], prices)
        self.assertEqual(SEED.plan_rate_updates([offer], prices, True), [dict(
            model_alias='test/model', currency='USD', prompt_rate='3', completion_rate='4',
            expected_revision='opaque-revision')])
        self.assertEqual(offer['prompt_rate'], '1')
        self.assertEqual(SEED.plan_rate_updates([offer], {'test/model': ('1', '2')}, True), [])
        for invalid in [[offer, offer], [dict(offer, currency='EUR')]]:
            with self.assertRaises(ValueError):
                SEED.plan_rate_updates(invalid, prices, True)

    def test_check_mode_never_writes_configuration(self):
        for missing_offer in [False, True]:
            calls = []
            fixtures = {
                'https://openrouter.ai/api/v1/models': [dict(id='test/model', pricing=dict(prompt='0.000000000000003', completion='0.000000000000004'))],
                'http://127.0.0.1:2566/admin/v1/providers': [dict(id='supplier-one', name='OpenRouter')],
                'http://127.0.0.1:2566/admin/v1/vendors': [dict(id='key-one', name='Demo key', adapter='openrouter', revision=1)],
                'http://127.0.0.1:2566/admin/v1/vendors/key-one/models': [dict(alias='test/model', upstream_model='test/model')],
                'http://127.0.0.1:2566/admin/v1/providers/supplier-one/administration': dict(offers=[] if missing_offer else [dict(model_alias='test/model', currency='USD', prompt_rate='3', completion_rate='4')]),
                'http://127.0.0.1:2566/admin/v1/vendors/key-one/supplier': dict(id='supplier-one', name='OpenRouter'),
            }
            def read(request, timeout):
                url = request if isinstance(request, str) else request.full_url
                method = 'GET' if isinstance(request, str) else request.get_method()
                calls.append((url, method))
                self.assertEqual(method, 'GET')
                response = io.BytesIO(json.dumps(dict(data=fixtures[url])).encode())
                response.status = 200
                return response
            with patch.object(SEED, 'MODELS', ['test/model']), patch.object(SEED, 'urlopen', read), patch.dict(SEED.os.environ, dict(NIU_ADMIN_TOKEN='fixture-admin-token', NIU_ADMIN_URL='http://127.0.0.1:2566')), patch('sys.argv', ['seed', '--check', '--vendor-name', 'Demo key']), redirect_stdout(io.StringIO()):
                if missing_offer:
                    with self.assertRaises(ValueError): SEED.main()
                else:
                    SEED.main()
            self.assertEqual(len(calls), 6)

    def test_check_requires_complete_routes_offers_and_supplier_ownership(self):
        prices = {'test/model': ('3', '4')}
        routes = {'test/model': {'upstream_model': 'test/model'}}
        offers = [dict(model_alias='test/model', currency='USD', prompt_rate='3', completion_rate='4')]
        SEED.verify_check_state(routes, offers, prices, {'id': 'supplier-one'}, 'supplier-one')
        for selected_routes, selected_offers, owner in [
            ({}, offers, {'id': 'supplier-one'}),
            (routes, [], {'id': 'supplier-one'}),
            (routes, offers, None),
            (routes, offers, {'id': 'another-business'}),
        ]:
            with self.assertRaises(ValueError):
                SEED.verify_check_state(selected_routes, selected_offers, prices, owner, 'supplier-one')

    def test_route_identity_must_match_the_priced_model(self):
        SEED.verify_routes({}, ['test/model'])
        SEED.verify_routes({'test/model': {'upstream_model': 'test/model'}}, ['test/model'])
        with self.assertRaises(ValueError):
            SEED.verify_routes({'test/model': {'upstream_model': 'other/model'}}, ['test/model'])


if __name__ == '__main__':
    unittest.main()
