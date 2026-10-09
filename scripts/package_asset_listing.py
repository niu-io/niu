"""Controlled listing recovery fixtures in disposable package databases only.

Requires Node's standard crypto module for production-compatible AES-GCM bytes.
No Supplier request occurs; synthetic grants/outcomes do not qualify live rights.
"""
import hashlib
import json
import subprocess
import uuid


def _uuid(value):
    return str(uuid.UUID(value))


def encrypted_page(master, organization, workspace, listing, page, *, lookup=False, read=False):
    assert not (lookup and read), "one result domain required"
    # Secrets travel only through stdin, never process arguments or environment.
    script = """
const fs = require('node:fs'), crypto = require('node:crypto');
const v = JSON.parse(fs.readFileSync(0, 'utf8'));
const nonce = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(v.master).digest(), nonce);
const identity = x => Buffer.from(x.replaceAll('-', ''), 'hex');
cipher.setAAD(Buffer.concat([Buffer.from(v.domain), identity(v.organization), identity(v.workspace), identity(v.listing)]));
const bytes = Buffer.concat([cipher.update(JSON.stringify(v.page), 'utf8'), cipher.final()]);
process.stdout.write(Buffer.concat([Buffer.from([1]), nonce, bytes, cipher.getAuthTag()]).toString('hex'));
"""
    return subprocess.check_output(
        ['node', '-e', script], input=json.dumps({
            'master': master, 'organization': _uuid(organization),
            'workspace': _uuid(workspace), 'listing': _uuid(listing), 'page': page,
            'domain': 'niu.asset-read-result.v1' if read else ('niu.asset-lookup-result.v1' if lookup else 'niu.asset-listing-result.v1'),
        }).encode(), stderr=subprocess.PIPE).decode()


def listing_snapshot(database_value, intent):
    return database_value("SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r.id,"
        "'authorization',r.authorization_id,'parent',r.parent_listing_id,'page',r.page_number,"
        "'parent_digest',encode(r.parent_snapshot_sha256,'hex'),'maximum_items',r.maximum_items,"
        "'claimed_at',r.created_at,'outcome',o.outcome,'reason',o.reason,'duration',o.duration_ms,"
        "'count',o.item_count,'more',o.has_more,'completed_at',o.created_at,"
        "'cipher_sha256',encode(sha256(result.ciphertext),'hex'),'expires_at',result.expires_at) "
        "ORDER BY r.created_at,r.id),'[]'::jsonb)::text FROM asset_listing_claims r "
        "LEFT JOIN asset_listing_outcomes o ON o.listing_id=r.id "
        "LEFT JOIN asset_listing_results result ON result.listing_id=r.id "
        f"WHERE r.intent_id='{_uuid(intent)}'")


def prepare_listing_fixture(request, database_value, prepared, master, *, include_lookups=False):
    vendor = _uuid(prepared['vendor'])
    scope = prepared['input']
    org, workspace = _uuid(scope['organization_id']), _uuid(scope['project_id'])
    revision = int(scope['vendor_revision'])
    assert revision > 0
    intent, grant = str(uuid.uuid4()), str(uuid.uuid4())
    root, child, unresolved = [str(uuid.uuid4()) for _ in range(3)]
    body = json.dumps({'Name': 'Package listing group', 'GroupType': 'AIGC',
                       'ProjectName': 'upgrade-original-project'}).replace("'", "''")
    # Explicitly synthetic original group and review evidence, only in this
    # disposable test database. Never send its configured Ark endpoint a request.
    database_value("INSERT INTO asset_group_create_intents(id,organization_id,project_id,idempotency_key,"
        "vendor_id,vendor_revision,credential_revision,upstream_project,request_body,request_fingerprint,"
        "request_expires_at,state,upstream_group_id) VALUES("
        f"'{intent}','{org}','{workspace}','{uuid.uuid4()}','{vendor}',{revision},1,"
        f"'upgrade-original-project','{body}'::jsonb,sha256(convert_to('{body}'::jsonb::text,'UTF8')),"
        "clock_timestamp()+interval '24 hours',"
        "'succeeded','group-package-fixture')")
    database_value("INSERT INTO asset_operation_authorizations(id,organization_id,project_id,vendor_id,"
        "vendor_revision,credential_revision,operation,rights_sha256,protocol_sha256,data_handling_sha256,"
        "free_operation_sha256,actor_kind,expires_at) VALUES("
        f"'{grant}','{org}','{workspace}','{vendor}',{revision},1,'ListAssets',"
        "sha256(convert_to('synthetic-package-rights','UTF8')),sha256(convert_to('synthetic-package-protocol','UTF8')),"
        "sha256(convert_to('synthetic-package-handling','UTF8')),sha256(convert_to('synthetic-package-free','UTF8')),"
        "'installation',clock_timestamp()+interval '24 hours')")
    root_cipher = None
    expected = []
    for number, listing in enumerate([root, child], 1):
        item = {'Id': f'asset-package-{number}', 'GroupId': 'group-package-fixture',
                'ProjectName': 'upgrade-original-project', 'Name': f'Package character {number}',
                'AssetType': 'Image', 'Status': 'Processing',
                'CreateTime': '2026-10-08T00:00:00Z', 'UpdateTime': '2026-10-08T00:00:01Z'}
        page = {'ResponseMetadata': {'Action': 'ListAssets', 'Version': '2024-01-01',
                 'Service': 'ark', 'Region': 'cn-beijing'},
                'Result': {'Items': [item], 'NextToken': 'private-package-cursor' if number == 1 else None}}
        ciphertext = encrypted_page(master, org, workspace, listing, page)
        parent = 'NULL' if number == 1 else f"'{root}'"
        digest = 'NULL' if number == 1 else f"decode('{hashlib.sha256(bytes.fromhex(root_cipher)).hexdigest()}','hex')"
        database_value("INSERT INTO asset_listing_claims(id,intent_id,authorization_id,maximum_items,"
            f"parent_listing_id,page_number,parent_snapshot_sha256) VALUES('{listing}','{intent}','{grant}',2,{parent},{number},{digest})")
        more = 'true' if number == 1 else 'false'
        database_value("INSERT INTO asset_listing_outcomes(listing_id,outcome,duration_ms,item_count,has_more) "
            f"VALUES('{listing}','succeeded',12,1,{more})")
        database_value(f"INSERT INTO asset_listing_results(listing_id,ciphertext) VALUES('{listing}',decode('{ciphertext}','hex'))")
        if number == 1:
            root_cipher = ciphertext
        expected.append({'listing_id': listing, 'items': [{'name': item['Name'], 'status': 'Processing',
            'asset_type': 'Image', 'created_at': item['CreateTime'], 'updated_at': item['UpdateTime'],
            'last_inference_at': None}], 'has_more': number == 1})
    database_value("INSERT INTO asset_listing_claims(id,intent_id,authorization_id,maximum_items) "
                   f"VALUES('{unresolved}','{intent}','{grant}',2)")
    saved = {'vendor': vendor, 'intent': intent, 'organization': org, 'workspace': workspace,
            'root': root, 'child': child, 'unresolved': unresolved, 'expected': expected,
            'snapshot': listing_snapshot(database_value, intent)}
    if include_lookups:
        saved['lookup'] = prepare_lookup_fixture(database_value, saved, grant, master)
    return saved


def assert_listing_fixture(request, database_value, saved):
    assert listing_snapshot(database_value, saved['intent']) == saved['snapshot'], \
        'listing audit, continuation linkage or encrypted content changed'
    base = f"/admin/v1/vendors/{_uuid(saved['vendor'])}/asset-management/listings"
    query = f"organization_id={_uuid(saved['organization'])}&project_id={_uuid(saved['workspace'])}"
    for expected in saved['expected']:
        status, page = request('GET', f"{base}/{_uuid(expected['listing_id'])}?{query}", admin=True)
        assert status == 200 and page['data'] == expected, 'encrypted listing recovery changed'
    status, history = request('GET', f'{base}?{query}', admin=True)
    assert status == 200
    rows = {row['listing_id']: row for row in history['data']}
    assert set(rows) == {saved['root'], saved['child'], saved['unresolved']}
    assert rows[saved['child']]['previous_listing_id'] == saved['root']
    assert rows[saved['child']]['page_number'] == 2 and rows[saved['child']]['has_more'] is False
    pending = rows[saved['unresolved']]
    assert pending['status'] == 'unresolved'
    assert all(pending[field] is None for field in ['completed_at', 'duration_ms', 'item_count', 'has_more'])
    for private in ['Package character', 'upgrade-original-project', 'group-package-fixture', 'private-package-cursor', 'ciphertext']:
        assert private not in json.dumps(history), 'listing history leaked private content'
    if 'lookup' in saved:
        assert_lookup_fixture(request, database_value, saved)


def lookup_snapshot(database_value, listing):
    return database_value("SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,"
        "'authorization',c.authorization_id,'index',c.item_index,"
        "'listing_digest',encode(c.listing_snapshot_sha256,'hex'),'claimed_at',c.created_at,"
        "'outcome',o.outcome,'asset_status',o.asset_status,'reason',o.reason,"
        "'duration',o.duration_ms,'completed_at',o.created_at,"
        "'cipher_sha256',encode(sha256(r.ciphertext),'hex'),'expires_at',r.expires_at) "
        "ORDER BY c.created_at,c.id),'[]'::jsonb)::text FROM asset_lookup_claims c "
        "LEFT JOIN asset_lookup_outcomes o ON o.lookup_id=c.id "
        "LEFT JOIN asset_lookup_results r ON r.lookup_id=c.id "
        f"WHERE c.listing_id='{_uuid(listing)}'")


def prepare_lookup_fixture(database_value, saved, listing_grant, master):
    grant, lookup, unresolved = [str(uuid.uuid4()) for _ in range(3)]
    root = _uuid(saved['root'])
    database_value("INSERT INTO asset_operation_authorizations(id,organization_id,project_id,vendor_id,"
        "vendor_revision,credential_revision,operation,rights_sha256,protocol_sha256,data_handling_sha256,"
        "free_operation_sha256,actor_kind,expires_at) SELECT "
        f"'{grant}',organization_id,project_id,vendor_id,vendor_revision,credential_revision,'GetAsset',"
        "rights_sha256,protocol_sha256,data_handling_sha256,free_operation_sha256,actor_kind,expires_at "
        f"FROM asset_operation_authorizations WHERE id='{_uuid(listing_grant)}'")
    for identity in [lookup, unresolved]:
        database_value("INSERT INTO asset_lookup_claims(id,listing_id,authorization_id,item_index,listing_snapshot_sha256) "
            f"SELECT '{identity}','{root}','{grant}',0,sha256(ciphertext) FROM asset_listing_results WHERE listing_id='{root}'")
    item = {'Id': 'asset-package-1', 'GroupId': 'group-package-fixture',
            'ProjectName': 'upgrade-original-project', 'Name': 'Package character 1',
            'AssetType': 'Image', 'Status': 'Processing',
            'CreateTime': '2026-10-08T00:00:00Z', 'UpdateTime': '2026-10-08T00:00:01Z'}
    page = {'ResponseMetadata': {'Action': 'ListAssets', 'Version': '2024-01-01',
            'Service': 'ark', 'Region': 'cn-beijing'}, 'Result': {'Items': [item], 'NextToken': None}}
    encrypted = encrypted_page(master, saved['organization'], saved['workspace'], lookup, page, lookup=True)
    database_value("INSERT INTO asset_lookup_outcomes(lookup_id,outcome,asset_status,duration_ms) "
                   f"VALUES('{lookup}','succeeded','Processing',13)")
    database_value(f"INSERT INTO asset_lookup_results(lookup_id,ciphertext) VALUES('{lookup}',decode('{encrypted}','hex'))")
    return {'id': lookup, 'unresolved': unresolved, 'snapshot': lookup_snapshot(database_value, root),
            'expected': {'lookup_id': lookup, 'asset': {'name': item['Name'], 'status': 'Processing', 'asset_type': 'Image',
                         'created_at': item['CreateTime'], 'updated_at': item['UpdateTime'], 'last_inference_at': None}}}


def assert_lookup_fixture(request, database_value, saved):
    lookup = saved['lookup']
    assert lookup_snapshot(database_value, saved['root']) == lookup['snapshot'], 'lookup audit or encrypted content changed'
    base = f"/admin/v1/vendors/{_uuid(saved['vendor'])}/asset-management/lookups"
    query = f"organization_id={_uuid(saved['organization'])}&project_id={_uuid(saved['workspace'])}"
    status, result = request('GET', f"{base}/{_uuid(lookup['id'])}?{query}", admin=True)
    assert status == 200 and result['data'] == lookup['expected'], 'encrypted lookup recovery changed'
    status, history = request('GET', f'{base}?{query}', admin=True)
    assert status == 200
    rows = {row['lookup_id']: row for row in history['data']}
    assert set(rows) == {lookup['id'], lookup['unresolved']}
    assert rows[lookup['id']]['status'] == 'succeeded' and rows[lookup['id']]['asset_status'] == 'Processing'
    pending = rows[lookup['unresolved']]
    assert pending['status'] == 'unresolved'
    assert all(pending[field] is None for field in ['completed_at', 'duration_ms', 'asset_status', 'reason'])
    for private in ['Package character', 'group-package-fixture', 'upgrade-original-project', 'ciphertext']:
        assert private not in json.dumps(history), 'lookup history leaked private content'
