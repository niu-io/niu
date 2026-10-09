"""Synthetic asset persistence across package upgrades; never qualifies upstream rights."""
import json
import secrets
import uuid
import urllib.error


def _uuid(value):
    return str(uuid.UUID(value))


def asset_snapshot(database_value, vendor, intent):
    vendor, intent = _uuid(vendor), _uuid(intent)
    return database_value(
        "SELECT jsonb_build_object('credential_revision',c.revision,"
        "'credential_sha256',encode(sha256(c.credential_ciphertext),'hex'),"
        "'upstream_project',c.upstream_project,'vendor_revision',i.vendor_revision,"
        "'request_fingerprint',encode(i.request_fingerprint,'hex'),"
        "'request_body_sha256',encode(sha256(convert_to(i.request_body::text,'UTF8')),'hex'),"
        "'request_upstream_project',i.upstream_project,"
        "'state',i.state,'upstream_group_id',i.upstream_group_id)::text "
        "FROM vendor_asset_management_credentials c JOIN asset_group_create_intents i "
        "ON i.vendor_id=c.vendor_id AND i.credential_revision=c.revision "
        f"WHERE c.vendor_id='{vendor}' AND i.id='{intent}'"
    )


def prepare_asset_upgrade(request, database_value, organization_id, project_id, *, name="Package asset recovery fixture"):
    organization_id, project_id = _uuid(organization_id), _uuid(project_id)
    status, response = request("POST", "/admin/v1/vendors", admin=True, payload={
        "name": name, "adapter": "openai",
        "api_base": "https://ark.cn-beijing.volcengineapi.com/api/v3",
        "api_key": secrets.token_urlsafe(32), "enabled": False,
    })
    assert status == 201
    vendor = _uuid(response["data"]["id"])
    path = f"/admin/v1/vendors/{vendor}/asset-management"
    status, _ = request("PUT", path, admin=True, payload={
        "expected_revision": 0, "upstream_project": "upgrade-original-project",
        "access_key": "AKUPGRADEEXAMPLE", "secret_key": secrets.token_urlsafe(32),
    })
    assert status == 200
    revision = int(database_value(f"SELECT revision FROM vendors WHERE id='{vendor}'"))
    assert revision > 0
    intent, key = str(uuid.uuid4()), str(uuid.uuid4())
    body = {"Name": "Package recovery character", "Description": "Original saved request",
            "GroupType": "AIGC", "ProjectName": "upgrade-original-project"}
    encoded = json.dumps(body).replace("'", "''")
    # The previous package has no creation API. Seed its original durable schema
    # without creating an upstream group or fabricating qualification/receipts.
    database_value("INSERT INTO asset_group_create_intents(id,organization_id,project_id,"
                   "idempotency_key,vendor_id,vendor_revision,credential_revision,upstream_project,"
                   "request_body,request_fingerprint,request_expires_at) VALUES("
                   f"'{intent}','{organization_id}','{project_id}','{key}','{vendor}',{revision},1,"
                   f"'upgrade-original-project','{encoded}'::jsonb,"
                   f"sha256(convert_to('{encoded}'::jsonb::text,'UTF8')),clock_timestamp()+interval '24 hours')")
    saved = asset_snapshot(database_value, vendor, intent)
    assert saved, "previous package did not preserve the seeded asset request"
    return {"vendor": vendor, "intent": intent, "snapshot": saved,
            "input": {"organization_id": organization_id, "project_id": project_id,
                      "idempotency_key": key, "vendor_revision": revision,
                      "credential_revision": 1, "name": body["Name"],
                      "description": body["Description"]}}


def assert_asset_upgrade(request, database_value, saved):
    vendor, intent = _uuid(saved["vendor"]), _uuid(saved["intent"])
    assert asset_snapshot(database_value, vendor, intent) == saved["snapshot"], \
        "upgrade changed original asset credential/request bindings"
    base = f"/admin/v1/vendors/{vendor}/asset-management"
    status, configuration = request("GET", base, admin=True)
    assert status == 200 and configuration["data"]["configured"] is True
    assert configuration["data"]["revision"] == 1
    scope = saved["input"]
    path = (f"/admin/v1/organizations/{_uuid(scope['organization_id'])}/projects/"
            f"{_uuid(scope['project_id'])}/asset-group-intents/{intent}/request")
    status, detail = request("GET", path, admin=True)
    assert status == 200 and detail["data"]["status"] == "prepared"
    assert detail["data"]["request"]["name"] == scope["name"]
    assert detail["data"]["request"]["description"] == scope["description"]
    assert detail["data"]["dispatch"] is None, "upgrade fabricated dispatch evidence"
    status, qualifications = request("GET", base + "/authorizations", admin=True)
    assert status == 200 and qualifications["data"] == [], "upgrade fabricated qualification"
    try:
        request("POST", base + "/groups", admin=True, payload=scope)
    except urllib.error.HTTPError as error:
        assert error.code == 409, "unqualified asset request was not rejected before dispatch"
    else:
        raise AssertionError("upgrade allowed unqualified asset dispatch")
    assert asset_snapshot(database_value, vendor, intent) == saved["snapshot"], \
        "rejected dispatch mutated the prepared request"
    assert database_value(f"SELECT count(*) FROM asset_group_dispatch_authorizations WHERE intent_id='{intent}'") == "0"
    assert database_value(f"SELECT count(*) FROM asset_group_dispatch_outcomes WHERE intent_id='{intent}'") == "0"
