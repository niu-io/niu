"""Synthetic update recovery; invalid management credential prevents any upstream call."""
import json
import urllib.error
import uuid


def _uuid(value):
    return str(uuid.UUID(value))


def update_snapshot(database_value, update):
    return database_value("SELECT jsonb_build_object('identity',u.id,'group',u.intent_id,"
        "'authorization',u.authorization_id,'patch_digest',encode(u.patch_sha256,'hex'),"
        "'prepared_at',u.created_at,'cipher_digest',encode(sha256(p.ciphertext),'hex'),"
        "'expires_at',p.expires_at,'claimed_at',c.created_at,'outcome',o.outcome,"
        "'reason',o.reason,'duration',o.duration_ms,'completed_at',o.created_at,"
        "'held',EXISTS(SELECT 1 FROM asset_group_update_holds h WHERE h.update_id=u.id))::text "
        "FROM asset_group_update_intents u JOIN asset_group_update_patches p ON p.update_id=u.id "
        "LEFT JOIN asset_group_update_claims c ON c.update_id=u.id "
        "LEFT JOIN asset_group_update_outcomes o ON o.update_id=u.id "
        f"WHERE u.id='{_uuid(update)}'")


def prepare_update_fixture(request, database_value, listing):
    vendor, original = _uuid(listing['vendor']), _uuid(listing['intent'])
    revision = int(database_value(f"SELECT COALESCE(max(revision),0)+1 FROM vendor_asset_management_credentials WHERE vendor_id='{vendor}'"))
    assert revision > 0
    # Invalid format byte is rejected deterministically before signer/transport.
    # Separate revision preserves the valid listing/lookup credential and grants.
    database_value("INSERT INTO vendor_asset_management_credentials(vendor_id,revision,upstream_project,credential_ciphertext) "
        f"VALUES('{vendor}',{revision},'upgrade-original-project',decode(repeat('00',48),'hex'))")
    intent, grant, update = [str(uuid.uuid4()) for _ in range(3)]
    database_value("INSERT INTO asset_group_create_intents(id,organization_id,project_id,idempotency_key,"
        "vendor_id,vendor_revision,credential_revision,upstream_project,request_body,request_fingerprint,"
        "request_expires_at,state,upstream_group_id) SELECT "
        f"'{intent}',organization_id,project_id,'{uuid.uuid4()}',vendor_id,vendor_revision,{revision},"
        "upstream_project,request_body,request_fingerprint,request_expires_at,'succeeded','group-update-recovery' "
        f"FROM asset_group_create_intents WHERE id='{original}'")
    database_value("INSERT INTO asset_operation_authorizations(id,organization_id,project_id,vendor_id,"
        "vendor_revision,credential_revision,operation,rights_sha256,protocol_sha256,data_handling_sha256,"
        "free_operation_sha256,actor_kind,expires_at) SELECT "
        f"'{grant}',a.organization_id,a.project_id,a.vendor_id,a.vendor_revision,{revision},'UpdateAssetGroup',"
        "a.rights_sha256,a.protocol_sha256,a.data_handling_sha256,a.free_operation_sha256,a.actor_kind,a.expires_at "
        "FROM asset_operation_authorizations a JOIN asset_listing_claims c ON c.authorization_id=a.id "
        f"WHERE c.id='{_uuid(listing['root'])}'")
    scope = {'organization_id': _uuid(listing['organization']), 'project_id': _uuid(listing['workspace'])}
    base = f'/admin/v1/vendors/{vendor}/asset-management/group-updates'
    status, result = request('POST', base, admin=True,
        payload=dict(scope, intent_id=intent, update_id=update, name='Restarted metadata patch'))
    assert status == 201 and result['data']['prepared'] is True
    return dict(scope, vendor=vendor, update=update, base=base, status='prepared',
                snapshot=update_snapshot(database_value, update))


def assert_update_fixture(request, database_value, saved):
    assert update_snapshot(database_value, saved['update']) == saved['snapshot'], 'update identity, ciphertext or audit changed'
    query = f"organization_id={_uuid(saved['organization_id'])}&project_id={_uuid(saved['project_id'])}"
    status, history = request('GET', f"{saved['base']}?{query}", admin=True)
    assert status == 200
    rows = [row for row in history['data'] if row['update_id'] == saved['update']]
    assert len(rows) == 1 and rows[0]['status'] == saved['status']
    assert rows[0]['patch_status'] == 'retained'
    assert rows[0]['reconciliation_required'] is (saved['status'] == 'uncertain')
    if saved['status'] == 'prepared':
        assert all(rows[0][field] is None for field in ['completed_at', 'duration_ms', 'reason'])
    else:
        assert rows[0]['reason'] == 'invalid_configuration'
        assert rows[0]['duration_ms'] >= 0 and rows[0]['completed_at'] is not None
    for private in ['Restarted metadata patch', 'group-update-recovery', 'upgrade-original-project', 'ciphertext', 'patch_digest']:
        assert private not in json.dumps(history), 'update audit leaked private content'


def dispatch_update_fixture(request, database_value, saved):
    assert saved['status'] == 'prepared'
    scope = {key: saved[key] for key in ['organization_id', 'project_id']}
    status, result = request('POST', f"{saved['base']}/{_uuid(saved['update'])}/dispatch", admin=True, payload=scope)
    assert status == 200 and result['data']['status'] == 'uncertain'
    assert result['data']['reconciliation_required'] is True
    saved['status'] = 'uncertain'
    saved['snapshot'] = update_snapshot(database_value, saved['update'])
    assert_update_fixture(request, database_value, saved)


def assert_update_replay_denied(request, saved):
    scope = {key: saved[key] for key in ['organization_id', 'project_id']}
    try:
        status, _ = request('POST', f"{saved['base']}/{_uuid(saved['update'])}/dispatch", admin=True, payload=scope)
    except urllib.error.HTTPError as error:
        assert error.code == 409, 'unexpected replay rejection'
    else:
        assert status == 409, 'uncertain update replayed'


def prepare_reconciliation_fixture(request, database_value, listing, master, encrypt):
    """Synthetic acknowledged write and interrupted saved read; never dispatch."""
    saved = prepare_update_fixture(request, database_value, listing)
    update = _uuid(saved['update'])
    read, grant = str(uuid.uuid4()), str(uuid.uuid4())
    database_value(f"INSERT INTO asset_group_update_claims(update_id) VALUES('{update}')")
    database_value("INSERT INTO asset_group_update_holds(intent_id,update_id) "
        f"SELECT intent_id,id FROM asset_group_update_intents WHERE id='{update}'")
    database_value(f"INSERT INTO asset_group_update_outcomes(update_id,outcome,duration_ms) VALUES('{update}','acknowledged',1)")
    database_value("INSERT INTO asset_operation_authorizations(id,organization_id,project_id,vendor_id,"
        "vendor_revision,credential_revision,operation,rights_sha256,protocol_sha256,data_handling_sha256,"
        "free_operation_sha256,actor_kind,expires_at) SELECT "
        f"'{grant}',a.organization_id,a.project_id,a.vendor_id,a.vendor_revision,a.credential_revision,"
        "'GetAssetGroup',a.rights_sha256,a.protocol_sha256,a.data_handling_sha256,a.free_operation_sha256,a.actor_kind,a.expires_at "
        f"FROM asset_operation_authorizations a JOIN asset_group_update_intents u ON u.authorization_id=a.id WHERE u.id='{update}'")
    database_value("INSERT INTO asset_group_read_claims(id,intent_id,authorization_id) "
        f"SELECT '{read}',intent_id,'{grant}' FROM asset_group_update_intents WHERE id='{update}'")
    database_value(f"INSERT INTO asset_group_update_reads(read_id,update_id) VALUES('{read}','{update}')")
    database_value(f"INSERT INTO asset_group_read_outcomes(read_id,outcome,duration_ms) VALUES('{read}','succeeded',1)")
    cipher = encrypt(master, saved['organization_id'], saved['project_id'], read,
        dict(read_id=read, name='Restarted metadata patch', description=None,
             created_at='2026-10-08T00:00:00Z', updated_at='2026-10-08T00:00:01Z'), read=True)
    database_value(f"INSERT INTO asset_group_read_results(read_id,ciphertext) VALUES('{read}',decode('{cipher}','hex'))")
    saved['read'] = read
    return saved


def reconcile_saved_fixture(request, database_value, saved):
    scope = {key: saved[key] for key in ['organization_id', 'project_id']}
    status, result = request('POST', f"{saved['base']}/{_uuid(saved['update'])}/reconcile",
        admin=True, payload=dict(scope, read_id=saved['read']))
    assert status == 200 and result['data']['status'] == 'reconciled'
    assert result['data']['reconciliation_required'] is False
    saved['reconciled_snapshot'] = reconciliation_snapshot(database_value, saved)
    assert_reconciliation_fixture(request, database_value, saved)


def reconciliation_snapshot(database_value, saved):
    return database_value("SELECT jsonb_build_object('update',r.update_id,'read',r.read_id,"
        "'at',r.created_at,'cipher',encode(sha256(p.ciphertext),'hex'),"
        "'expiry',p.expires_at,'held',EXISTS(SELECT 1 FROM asset_group_update_holds h WHERE h.update_id=r.update_id),"
        "'reads',(SELECT count(*) FROM asset_group_update_reads b WHERE b.update_id=r.update_id))::text "
        "FROM asset_group_update_reconciliations r JOIN asset_group_read_results p ON p.read_id=r.read_id "
        f"WHERE r.update_id='{_uuid(saved['update'])}'")


def assert_reconciliation_fixture(request, database_value, saved):
    current = reconciliation_snapshot(database_value, saved)
    assert current == saved['reconciled_snapshot'] and current
    audit = json.loads(current)
    assert audit['held'] is False and audit['reads'] == 1 and audit['read'] == saved['read']
    query = f"organization_id={_uuid(saved['organization_id'])}&project_id={_uuid(saved['project_id'])}"
    status, result = request('GET', f"{saved['base']}?{query}", admin=True)
    rows = [row for row in result['data'] if row['update_id'] == saved['update']]
    assert status == 200 and len(rows) == 1 and rows[0]['status'] == 'reconciled'
    assert rows[0]['reconciliation_required'] is False
