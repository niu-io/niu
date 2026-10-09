"""Synthetic video setup for isolated package tests, never live supply qualification."""
import time
import uuid
import urllib.error
from urllib.parse import urlsplit


def configure_video(request, organization, endpoint, credential, offer_lookup):
    """Use real management APIs; qualification hashes describe synthetic fixtures only."""
    organization = str(uuid.UUID(organization))
    upstream = urlsplit(endpoint)
    if upstream.scheme != 'http' or upstream.hostname not in ('127.0.0.1', 'localhost') or upstream.username or upstream.password or upstream.query or upstream.fragment:
        raise ValueError('Synthetic video configuration requires a local fixture endpoint')
    def admin(method, path, payload):
        status, result, _ = request(method, path, admin=True, payload=payload)
        assert status in (200, 201), 'packaged video configuration failed'
        return result

    supplier = admin('POST', '/admin/v1/providers', {'name':'Package video synthetic Supplier'})['data']['id']
    supplier = str(uuid.UUID(supplier))
    vendor = admin('POST', '/admin/v1/vendors', {'name':'Package video fixture credential',
        'adapter':'openai','api_base':endpoint,'api_key':credential,'enabled':True,'supplier_id':supplier})['data']
    vendor_id = str(uuid.UUID(vendor['id']))
    schema = {'version':1,'revision':'package-video-schema','model_alias':'package-video',
        'upstream_model':'fixture-video-model','channel':'ark-direct-v1','maximum_body_bytes':1024,
        'maximum_content_items':1,'inputs':{'text':{'maximum_items':1,'maximum_bytes':256,
        'https':False,'data_mime_types':[],'roles':[],'role_required':False}},
        'controls':{'resolution':{'kind':'choice','values':['720p'],'default':'720p'},
        'duration':{'kind':'integer','minimum':1,'maximum':10,'default':5},
        'ratio':{'kind':'choice','values':['16:9'],'default':'16:9'},
        'frames_per_second':{'kind':'integer','minimum':24,'maximum':60,'default':24}},
        'required_controls':[],'exclusive_controls':[],'callbacks_qualified':False,
        'output':{'specifications':[{'resolution':'720p','ratio':'16:9','width':1280,'height':720}],
        'estimator':'SeedancePixelsV1','estimator_revision':'synthetic-package-formula'}}
    model = admin('POST', f'/admin/v1/vendors/{vendor_id}/models', {'alias':'package-video',
        'upstream_model':'fixture-video-model','public_catalog':False,'enabled':True,
        'capabilities':{'video_schema':schema},'pricing':None,'expected_revision':None})['data']
    revision = str(uuid.uuid4())
    published = admin('POST', f'/admin/v1/providers/{supplier}/media-offers', {'revision':revision,
        'model_alias':'package-video','vendor_id':vendor_id,'vendor_revision':vendor['revision'],
        'model_revision':model['revision'],'schema_revision':schema['revision'],'expected_revision':None})
    assert published['data']['revision'] == revision, 'video offer revision changed unexpectedly'
    offer = str(uuid.UUID(offer_lookup(supplier)))
    expiry = int(time.time() * 1000) + 3600000
    admin('PUT', f'/admin/v1/providers/{supplier}/qualification', {
        'supply_rights_sha256':'a'*64,'supply_capability_sha256':'b'*64,
        'data_handling_sha256':'c'*64,'valid_until_ms':expiry})
    admin('PUT', f'/admin/v1/providers/{supplier}/offers/{offer}/qualification', {
        'rate_revision':revision,'model_identity_sha256':'d'*64,'protocol_matrix_sha256':'e'*64,
        'protocol_matrix_version':'synthetic-package-video-v1','data_handling_sha256':'f'*64,
        'availability_sha256':'1'*64,'agreed_rates_sha256':'2'*64,'valid_until_ms':expiry})
    actor = admin('POST', '/admin/v1/operators', {'organization_id':organization,'project_id':None,
        'name':'Package synthetic Supplier manager','role':'owner','expires_in_seconds':86400})
    actor_id = str(uuid.UUID(actor['operator']['id']))
    admin('PUT', f'/admin/v1/providers/{supplier}/members/{actor_id}', {'role':'manager','active':True})
    status, _, _ = request('PATCH', f'/admin/v1/providers/{supplier}/offers/{offer}',
        bearer_token=actor['token'],payload={'active':True})
    assert status == 200, 'synthetic media offer activation failed'
    rational = lambda amount: {'numerator':str(amount),'denominator':'1'}
    tariff = {'revision':'package-video-selling-tariff','dimensions':{'model':'package-video',
        'channel':'ark-direct-v1','resolution':'720p','reference_video':False},'meter':'video_tokens',
        'currency':'USD','decimal_places':9,'amount_units':100,'per_quantity':rational(1000000),
        'minimum_quantity':rational(0),'rounding':'Up','effective_from':0,'effective_until':None}
    common = {'vendor_revision':vendor['revision'],'model_revision':model['revision'],
        'schema_revision':schema['revision'],'offer_revision':revision,'discounts':[]}
    admin('POST', f'/admin/v1/organizations/{organization}/billing/media-rates', {**common,
        'revision':'package-video-selling','vendor_id':vendor_id,'tariff':tariff,
        'maximum_quantity':rational(200000),'liability_qualification_revision':'synthetic-package-bound'})
    admin('POST', f'/admin/v1/providers/{supplier}/media-rates', {**common,
        'revision':'package-video-purchase','tariff':{**tariff,'revision':'package-video-purchase-tariff','amount_units':40}})
    return {'supplier':supplier,'vendor':vendor_id,'vendor_revision':vendor['revision'],'endpoint':endpoint,'model':'package-video','customer_rate':{**common,'revision':'package-video-selling','vendor_id':vendor_id,'tariff':tariff,'maximum_quantity':rational(200000),'liability_qualification_revision':'synthetic-package-bound'}}


def create_video(request, organization, after_submit=None, defer_completion=False):
    status, workspace, _ = request('POST', f'/admin/v1/organizations/{organization}/projects',
        admin=True,payload={'name':'Packaged video recovery'})
    assert status == 201
    workspace_id = str(uuid.UUID(workspace['id']))
    status, key, _ = request('POST', f'/admin/v1/organizations/{organization}/projects/{workspace_id}/keys',
        admin=True,payload={'name':'Packaged video client','allowed_models':['package-video'],'ttl_seconds':86400})
    assert status == 201 and key.get('token')
    status, job, _ = request('POST','/v1/video/jobs',bearer_token=key['token'],
        payload={'model':'package-video','content':[{'type':'text','text':'Package recovery fixture'}]})
    assert status == 202
    job_id = str(uuid.UUID(job['id']))
    if after_submit is not None:
        after_submit()
    video = {'id':job_id,'token':key['token'],'key_id':str(uuid.UUID(key['id'])),'workspace':workspace_id}
    if not defer_completion:
        complete_saved_video(request, video)
    return video


def complete_saved_video(request, video):
    """Query a saved job without repeating generation, including across images."""
    for _ in range(60):
        status, state, _ = request('POST',f'/v1/video/jobs/{video["id"]}/refresh',bearer_token=video['token'])
        assert status == 200
        if state['status'] == 'succeeded':
            break
        assert state['status'] in ('unknown','queued','running'), 'video job entered an unexpected state'
        time.sleep(0.5)
    else:
        raise AssertionError('packaged video did not reach its terminal state')
    status, bill, _ = request('GET',f'/v1/video/jobs/{video["id"]}/billing',bearer_token=video['token'])
    assert status == 200 and bill['charge_nanos'] == '10', 'video did not settle its exact customer rate'
    video['billing'] = bill


def revoke_video_key(request, video):
    status, _, _ = request('DELETE',f'/admin/v1/organizations/{video["organization"]}/projects/{video["workspace"]}/keys/{video["key_id"]}',admin=True)
    assert status == 204, 'video API key revocation failed'


def assert_revoked_video_key_denied(request, video):
    for method, suffix in [('GET',''),('GET','/billing'),('POST','/refresh')]:
        try:
            status, _, _ = request(method,f'/v1/video/jobs/{video["id"]}{suffix}',bearer_token=video['token'])
        except urllib.error.HTTPError as error:
            status=error.code;error.close()
        assert status == 401, f'revoked API key retained video access: {status}'


def assert_video_recovered(request, video):
    status, job, _ = request('POST',f'/v1/video/jobs/{video["id"]}/refresh',bearer_token=video['token'])
    assert status == 200 and job['status'] == 'succeeded', 'saved video status was lost'
    status, bill, _ = request('GET',f'/v1/video/jobs/{video["id"]}/billing',bearer_token=video['token'])
    assert status == 200 and bill == video['billing'], 'historical customer video charge changed'


def assert_video_result_state(request, video, expected='available'):
    status, result, _ = request('GET',f'/v1/video/jobs/{video["id"]}/results',bearer_token=video['token'])
    assert status == 200 and result == {'video':expected,'last_frame':'missing' if expected=='available' else 'unavailable'}, 'saved result availability changed'


def delete_video_results(request, video):
    status, result, _ = request('DELETE',f'/v1/video/jobs/{video["id"]}/results',bearer_token=video['token'])
    assert status == 200 and result == {'deleted':True}, 'authorized result deletion failed'


def replace_fixture_customer_rate(request, organization, configuration):
    """Change future synthetic selling prices without rewriting admitted jobs."""
    upstream = urlsplit(configuration['endpoint'])
    if upstream.scheme != 'http' or upstream.hostname not in ('127.0.0.1', 'localhost') or upstream.username or upstream.password or upstream.query or upstream.fragment:
        raise ValueError('Synthetic rate replacement requires a local fixture endpoint')
    organization = str(uuid.UUID(organization))
    previous = configuration['customer_rate']
    replacement = {**previous, 'revision':'package-video-selling-replacement',
        'tariff':{**previous['tariff'], 'revision':'package-video-selling-replacement-tariff',
            'amount_units':1000, 'effective_from':int(time.time())}}
    status, _, _ = request('POST',f'/admin/v1/organizations/{organization}/billing/media-rates/replace',
        admin=True,payload={'previous_revision':previous['revision'],'rate':replacement})
    assert status == 200, 'synthetic rate replacement failed'


def assert_replacement_rate_effective(request, video):
    status, estimate, _ = request('POST','/v1/video/estimate',bearer_token=video['token'],
        payload={'model':'package-video','content':[{'type':'text','text':'Future tariff estimate'}]})
    assert status == 200 and estimate['maximum_charge_nanos'] == '200', 'future admission did not use the replacement selling price'


def rotate_fixture_credential(request, configuration, credential):
    """Rotate only the synthetic local credential; saved jobs must retain their original route."""
    upstream = urlsplit(configuration['endpoint'])
    if upstream.scheme != 'http' or upstream.hostname not in ('127.0.0.1', 'localhost') or upstream.username or upstream.password or upstream.query or upstream.fragment:
        raise ValueError('Synthetic rotation requires a local fixture endpoint')
    vendor = str(uuid.UUID(configuration['vendor']))
    supplier = str(uuid.UUID(configuration['supplier']))
    status, current, _ = request('GET',f'/admin/v1/vendors?supplier={supplier}',admin=True)
    assert status == 200, 'could not read the synthetic credential revision'
    matches = [row for row in current['data'] if row['id'] == vendor]
    assert len(matches) == 1, 'synthetic credential is unavailable'
    revision = matches[0]['revision']
    assert type(revision) is int and revision > 0, 'invalid synthetic credential revision'
    status, _, _ = request('PUT',f'/admin/v1/vendors/{vendor}',admin=True,payload={
        'name':'Package video fixture credential','api_base':configuration['endpoint'],
        'enabled':True,'expected_revision':revision,'api_key':credential})
    assert status == 200, 'synthetic credential rotation failed'


def assert_rotated_recovery_blocked(request, video):
    """An unqualified changed credential cannot query the original route."""
    try:
        status, _, _ = request('POST',f'/v1/video/jobs/{video["id"]}/refresh',bearer_token=video['token'])
    except urllib.error.HTTPError as error:
        status = error.code
        error.close()
    assert status == 409, 'changed credential was allowed to query a saved job'
    status, job, _ = request('GET',f'/v1/video/jobs/{video["id"]}',bearer_token=video['token'])
    assert status == 200 and job['status'] == 'succeeded', 'saved status was lost after rotation'
    status, bill, _ = request('GET',f'/v1/video/jobs/{video["id"]}/billing',bearer_token=video['token'])
    assert status == 200 and bill == video['billing'], 'rotation changed historical customer billing'


def create_uncertain_video(request, configuration, fund_account):
    """A second isolated customer keeps unconfirmed liability separate from settled charges."""
    status, organization, _ = request('POST','/admin/v1/organizations',admin=True,
        payload={'name':'Package uncertain video customer'})
    assert status == 201
    organization = str(uuid.UUID(organization['id']))
    fund_account(organization)
    status, _, _ = request('POST',f'/admin/v1/organizations/{organization}/billing/media-rates',
        admin=True,payload={**configuration['customer_rate'], 'revision':'package-video-uncertain-selling',
            'tariff':{**configuration['customer_rate']['tariff'], 'revision':'package-video-uncertain-selling-tariff'}})
    assert status == 200
    status, workspace, _ = request('POST',f'/admin/v1/organizations/{organization}/projects',
        admin=True,payload={'name':'Uncertain video recovery'})
    assert status == 201
    workspace = str(uuid.UUID(workspace['id']))
    status, key, _ = request('POST',f'/admin/v1/organizations/{organization}/projects/{workspace}/keys',
        admin=True,payload={'name':'Uncertain video client','allowed_models':['package-video'],'ttl_seconds':86400})
    assert status == 201 and key.get('token')
    status, job, _ = request('POST','/v1/video/jobs',bearer_token=key['token'],
        payload={'model':'package-video','content':[{'type':'text','text':'Package uncertain submission fixture'}]})
    assert status == 202 and job['status'] == 'submission_unknown'
    return {'id':str(uuid.UUID(job['id'])),'token':key['token'],'organization':organization}


def assert_uncertain_video_retained(request, video):
    status, job, _ = request('GET',f'/v1/video/jobs/{video["id"]}',bearer_token=video['token'])
    assert status == 200 and job['status'] == 'submission_unknown', 'uncertain submission state was lost'
    status, accounts, _ = request('GET',f'/admin/v1/organizations/{video["organization"]}/billing/balance',admin=True)
    assert status == 200 and len(accounts['data']) == 1
    account = accounts['data'][0]
    assert account['currency'] == 'USD' and account['balance_nanos'] == '50000000000'
    assert account['reserved_nanos'] == '20' and account['available_nanos'] == '49999999980', 'unconfirmed liability was released or charged'
    status, ledger, _ = request('GET',f'/admin/v1/organizations/{video["organization"]}/billing/transactions',admin=True)
    assert status == 200 and not ledger.get('next_cursor') and not ledger.get('has_more')
    assert len(ledger['data']) == 1 and ledger['data'][0]['kind'] == 'funding', 'uncertain creation was charged or replayed'
    try:
        status, _, _ = request('POST',f'/v1/video/jobs/{video["id"]}/refresh',bearer_token=video['token'])
    except urllib.error.HTTPError as error:
        status = error.code
        error.close()
    assert status == 409, 'unknown submission was retried without a bound job identity'


def create_video_reader(request, organization, video):
    """An ordinary scoped reader diagnoses customer charges, never procurement."""
    status, reader, _ = request('POST','/admin/v1/operators',admin=True,payload={
        'organization_id':str(uuid.UUID(organization)), 'project_id':video['workspace'],
        'name':'Package video Logs reader','role':'viewer','expires_in_seconds':86400})
    assert status == 201 and reader.get('token'), 'scoped video reader creation failed'
    status, foreign, _ = request('POST',f'/admin/v1/organizations/{organization}/projects',admin=True,
        payload={'name':'Foreign video diagnosis workspace'})
    assert status == 201
    video.update(organization=str(uuid.UUID(organization)),reader_token=reader['token'],reader_id=str(uuid.UUID(reader['operator']['id'])),foreign_workspace=str(uuid.UUID(foreign['id'])))


def revoke_video_reader(request, video):
    status, _, _ = request('DELETE',f'/admin/v1/operators/{video["reader_id"]}',admin=True)
    assert status == 204, 'video reader revocation failed'


def assert_revoked_video_reader_denied(request, video):
    base=f'/admin/v1/organizations/{video["organization"]}/projects/{video["workspace"]}/requests'
    for path in [base+'?limit=100',f'{base}/{video["id"]}']:
        try:
            status, _, _ = request('GET',path,bearer_token=video['reader_token'])
        except urllib.error.HTTPError as error:
            status=error.code;error.close()
        assert status == 401, f'revoked reader retained customer Logs access: {status}'


def assert_video_activity_reconciled(request, video):
    base=f'/admin/v1/organizations/{video["organization"]}/projects/{video["workspace"]}/requests'
    status, detail, _ = request('GET',f'{base}/{video["id"]}',bearer_token=video['reader_token'])
    assert status == 200
    status, listing, _ = request('GET',base+'?limit=100',bearer_token=video['reader_token'])
    assert status == 200
    matches=[row for row in listing['data'] if row['attempt_id']==video['id']]
    assert len(matches)==1, 'saved video missing or duplicated in customer Logs'
    for row in [detail['data'],matches[0]]:
        assert row['request_kind']=='video'
        assert row['customer_charge_nanos']==video['billing']['charge_nanos']
        assert row['customer_charge_currency']==video['billing']['currency']
    def safe(value):
        if isinstance(value,dict):
            assert not set(value)&{'supplier_cost','upstream_cost','procurement','purchase_price','credential_ciphertext','vendor_id'}, 'private procurement fields leaked into customer Logs'
            for item in value.values():safe(item)
        elif isinstance(value,list):
            for item in value:safe(item)
    safe(detail);safe(listing)
    foreign=f'/admin/v1/organizations/{video["organization"]}/projects/{video["foreign_workspace"]}/requests/{video["id"]}'
    try:
        status, _, _ = request('GET',foreign,bearer_token=video['reader_token'])
    except urllib.error.HTTPError as error:
        status=error.code;error.close()
    assert status==404, f'foreign workspace was not concealed from scoped Logs reader: {status}'
