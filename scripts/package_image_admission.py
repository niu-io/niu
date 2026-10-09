"""Packaged negative image admission; no detector or upstream entitlement is assumed."""
import json
import uuid
import urllib.error


def assert_image_admission(request, database_value, token):
    identifiers = [str(uuid.uuid4()) for _ in range(4)]
    source, consent, group, authorization = identifiers
    ingestion = f"/v1/media/image-ingestions/{consent}"
    readiness = ingestion + f"/readiness/{uuid.uuid4()}"
    image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCaoAAAAASUVORK5CYII="
    preparation = {"image": image, "valid_for_seconds": 60}
    snapshot_sql = "SELECT jsonb_build_array(" + ",".join(
        f"(SELECT count(*) FROM {table})" for table in (
            "inspected_image_sources", "asset_image_ingestion_consents",
            "asset_image_ingestion_claims", "asset_image_ingestion_outcomes",
            "ingested_image_readiness_claims", "ingested_image_readiness_outcomes",
            "attempts", "customer_balance_entries", "customer_balance_reservations",
        )) + ")::text"
    before = database_value(snapshot_sql)

    def rejected(method, path, expected, payload=None, **auth):
        try:
            request(method, path, payload=payload, **auth)
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8")
            assert error.code == expected, f"image admission returned {error.code}, expected {expected}"
            parsed = json.loads(body)
            assert isinstance(parsed.get("error"), dict), "image API returned a non-API error"
            assert image not in body and token not in body, "image admission echoed private input"
        else:
            raise AssertionError("unqualified image operation unexpectedly succeeded")

    for method, path, payload in (
        ("POST", "/v1/media/image-sources", preparation),
        ("DELETE", f"/v1/media/image-sources/{source}", None),
        ("GET", ingestion, None), ("DELETE", ingestion, None),
        ("POST", ingestion + "/dispatch", {}),
        ("POST", readiness, {}), ("GET", readiness, None),
    ):
        rejected(method, path, 401, payload)
        rejected(method, path, 401, payload, admin=True)
    rejected("POST", "/v1/media/image-sources", 400,
             {**preparation, "verdict": "allow"}, bearer_token=token)
    rejected("POST", "/v1/media/image-sources", 403, preparation, bearer_token=token)
    rejected("PUT", ingestion, 409, {
        "source_id": source, "group_intent_id": group,
        "authorization_id": authorization, "valid_for_seconds": 60,
        "confirm_ingestion": True,
    }, bearer_token=token)
    rejected("GET", ingestion, 404, bearer_token=token)
    rejected("GET", readiness, 404, bearer_token=token)
    status, _, _ = request("DELETE", f"/v1/media/image-sources/{source}", bearer_token=token)
    assert status == 204, "missing-source erasure must remain opaque and idempotent"
    assert database_value(snapshot_sql) == before, "denied image operations changed durable work or accounting"


def assert_source_lifecycle(request, database_value, token, organization, workspace, configure, restart, recover, *, history=False):
    import base64
    import struct
    import zlib
    config = f"""
[image_detectors.package-image]
endpoint = "http://127.0.0.1:24678/fixture/inspect-image"
api_key_env = "PROVIDER_KEY"
detector_revision = "package-v2"
recipient = "Isolated package fixture"
region = "Loopback"
retention = "None declared"
authorized_workspaces = ["{workspace}"]
declared_unmetered = true
timeout_ms = 1000
maximum_encoded_bytes = 4096
maximum_width = 32
maximum_height = 32
maximum_decoded_bytes = 4096
concurrency = 1
"""
    configure(config)
    restart()
    policy_path = f"/admin/v1/organizations/{organization}/projects/{workspace}/guardrails"
    _, descriptions, _ = request("GET", policy_path + "/image-detectors", admin=True)
    fingerprint = next(row["configuration_fingerprint"] for row in descriptions["data"] if row["detector"] == "package-image")
    _, current, _ = request("GET", policy_path, admin=True)
    request("PUT", policy_path, admin=True, payload={"expected_revision": (current["data"] or {"revision": 0})["revision"], "policy": {
        "schema_version": 1, "name": "Package images", "models": {"mode": "inherit"},
        "providers": {"mode": "inherit"}, "image_detectors": [{"detector": "package-image",
        "configuration_fingerprint": fingerprint, "consent_to_image_processing": True}]}})
    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"\0\0\0\0")) + chunk(b"IEND", b"")
    status, prepared, _ = request("POST", "/v1/media/image-sources", bearer_token=token,
        payload={"image": "data:image/png;base64," + base64.b64encode(png).decode(), "valid_for_seconds": 300})
    assert status == 201 and prepared["data"]["retained"] is True
    source = str(uuid.UUID(prepared["data"]["source_id"]))
    count_sql = f"SELECT count(*) FROM inspected_image_source_content WHERE source_id='{source}'"
    assert database_value(count_sql) == "1"
    _, other, _ = request("POST", f"/admin/v1/organizations/{organization}/projects/{workspace}/keys", admin=True,
        payload={"name": "Other image client", "allowed_models": ["fast"], "ttl_seconds": 3600})
    path = f"/v1/media/image-sources/{source}"
    assert request("DELETE", path, bearer_token=other["token"])[0] == 204
    assert database_value(count_sql) == "1", "foreign key erased inspected source"
    restart()
    assert database_value(count_sql) == "1", "inspected source lost across restart"
    content_signature = f"SELECT encode(sha256(ciphertext),'hex') FROM inspected_image_source_content WHERE source_id='{source}'"
    original_signature = database_value(content_signature)
    assert original_signature
    binding = bind_delivery_fixture(request, database_value, token, organization, workspace, source, history=history)
    delivery_path = binding["delivery"]
    status, delivered, content_type = request("GET", delivery_path)
    assert status == 200 and delivered == png and content_type == "image/png"
    _, before_history, _ = request("GET", binding["readiness"], bearer_token=token)
    assert before_history["data"]["asset_status"] == "Active"
    assert before_history["data"]["reuse_available"] is False
    if history:
        _, before_page, _ = request("GET", "/v1/media/image-ingestions", bearer_token=token)
    recover()
    if history:
        _, after_page, _ = request("GET", "/v1/media/image-ingestions", bearer_token=token)
        assert before_page == after_page, "ingestion history changed across restore"
        _, foreign_page, _ = request("GET", "/v1/media/image-ingestions", bearer_token=other["token"])
        assert foreign_page["data"] == [], "foreign key listed original ingestion"
        cursor = after_page["data"][0]["consent_id"]
        try:
            request("GET", f"/v1/media/image-ingestions?before={cursor}", bearer_token=other["token"])
        except urllib.error.HTTPError as error:
            assert error.code == 404
            error.close()
        else:
            raise AssertionError("foreign key used original history cursor")
    _, after_history, _ = request("GET", binding["readiness"], bearer_token=token)
    assert after_history == before_history, "saved readiness changed through restoration"
    try:
        request("GET", binding["readiness"], bearer_token=other["token"])
    except urllib.error.HTTPError as error:
        assert error.code == 404, "foreign key accessed saved readiness"
        error.close()
    else:
        raise AssertionError("foreign key accessed saved readiness")
    assert database_value(content_signature) == original_signature, "source ciphertext changed across database recovery"
    assert request("DELETE", path, bearer_token=other["token"])[0] == 204
    assert database_value(count_sql) == "1", "restored ownership allowed foreign erasure"

    status, delivered, content_type = request("GET", delivery_path)
    assert status == 200 and delivered == png and content_type == "image/png", "restored source delivery changed exact bytes"
    for _ in range(2):
        assert request("DELETE", path, bearer_token=token)[0] == 204
    assert database_value(count_sql) == "0"
    assert database_value(f"SELECT count(*) FROM inspected_image_source_erasures WHERE source_id='{source}'") == "1"
    try:
        request("GET", delivery_path)
    except urllib.error.HTTPError as error:
        assert error.code == 404, "erased source remained deliverable"
        error.close()
    else:
        raise AssertionError("erased source remained deliverable")



def bind_delivery_fixture(request, database_value, token, organization, workspace, source, *, history=False):
    """Synthetic original group/grant/claim/access; never sends a Provider write.

    Source bytes/proofs and consent use real APIs. These database fixture rows
    qualify decryption/delivery only, not group creation or capability issuance.
    """
    import hashlib
    import secrets
    _, vendor, _ = request("POST", "/admin/v1/vendors", admin=True, payload={
        "name": "Source delivery fixture", "adapter": "openai", "enabled": False,
        "api_base": "https://ark.cn-beijing.volcengineapi.com/api/v3",
        "api_key": secrets.token_urlsafe(32)})
    vendor = str(uuid.UUID(vendor["data"]["id"]))
    request("PUT", f"/admin/v1/vendors/{vendor}/asset-management", admin=True,
        payload={"expected_revision": 0, "upstream_project": "package-source-project",
                 "access_key": "AKPACKAGESOURCE", "secret_key": secrets.token_urlsafe(32)})
    revision = int(database_value(f"SELECT revision FROM vendors WHERE id='{vendor}'"))
    intent, grant, consent = [str(uuid.uuid4()) for _ in range(3)]
    body = json.dumps({"Name": "Source delivery", "GroupType": "AIGC", "ProjectName": "package-source-project"})
    database_value("INSERT INTO asset_group_create_intents(id,organization_id,project_id,idempotency_key,"
        "vendor_id,vendor_revision,credential_revision,upstream_project,request_body,request_fingerprint,request_expires_at,state,upstream_group_id) VALUES("
        f"'{intent}','{organization}','{workspace}','{uuid.uuid4()}','{vendor}',{revision},1,"
        f"'package-source-project','{body}'::jsonb,sha256(convert_to('{body}'::jsonb::text,'UTF8')),"
        "clock_timestamp()+interval '1 hour','succeeded','group-package-source')")
    database_value("INSERT INTO asset_operation_authorizations(id,organization_id,project_id,vendor_id,"
        "vendor_revision,credential_revision,operation,rights_sha256,protocol_sha256,data_handling_sha256,free_operation_sha256,actor_kind,expires_at) VALUES("
        f"'{grant}','{organization}','{workspace}','{vendor}',{revision},1,'CreateAsset',"
        "sha256('synthetic-source-rights'::bytea),sha256('synthetic-source-protocol'::bytea),"
        "sha256('synthetic-source-handling'::bytea),sha256('synthetic-source-free'::bytea),"
        "'installation',clock_timestamp()+interval '1 hour')")
    status, _, _ = request("PUT", f"/v1/media/image-ingestions/{consent}", bearer_token=token,
        payload={"source_id": source, "group_intent_id": intent, "authorization_id": grant,
                 "valid_for_seconds": 60, "confirm_ingestion": True})
    assert status == 201
    if history:
        _, page, _ = request("GET", "/v1/media/image-ingestions", bearer_token=token)
        saved = next(row for row in page["data"] if row["consent_id"] == consent)
        assert saved["status"] == "consented" and saved["reason"] is None and saved["duration_ms"] is None and saved["observed_at"] is None
        for command in (f"/v1/media/image-ingestions/{consent}/dispatch",
                        f"/v1/media/image-ingestions/{consent}/readiness/{uuid.uuid4()}"):
            try:
                request("POST", command, bearer_token=token, payload={"asset_id": "asset-override"})
            except urllib.error.HTTPError as error:
                assert error.code == 400, "packaged command silently accepted an override"
                error.close()
            else:
                raise AssertionError("packaged command silently accepted an override")
        assert database_value(f"SELECT count(*) FROM asset_image_ingestion_claims WHERE consent_id='{consent}'") == "0"
    database_value(f"INSERT INTO asset_image_ingestion_claims(consent_id) VALUES('{consent}')")
    access = "nis_" + secrets.token_hex(32)
    digest = hashlib.sha256(access.encode()).hexdigest()
    database_value("INSERT INTO asset_image_source_access(token_sha256,consent_id,expires_at) VALUES("
        f"decode('{digest}','hex'),'{consent}',statement_timestamp()+interval '60 seconds')")
    # Explicit accepted and Active observations are fixture evidence only; no
    # upstream operation is invoked and no reusable-reference right is granted.
    read_grant, read_id = str(uuid.uuid4()), str(uuid.uuid4())
    database_value("INSERT INTO asset_image_ingestion_outcomes(consent_id,outcome,upstream_asset_id,duration_ms) "
        f"VALUES('{consent}','accepted','asset-package-source',12)")
    database_value("INSERT INTO asset_operation_authorizations(id,organization_id,project_id,vendor_id,"
        "vendor_revision,credential_revision,operation,rights_sha256,protocol_sha256,data_handling_sha256,free_operation_sha256,actor_kind,expires_at) "
        f"SELECT '{read_grant}',organization_id,project_id,vendor_id,vendor_revision,credential_revision,'GetAsset',"
        f"rights_sha256,protocol_sha256,data_handling_sha256,free_operation_sha256,actor_kind,expires_at FROM asset_operation_authorizations WHERE id='{grant}'")
    database_value(f"INSERT INTO ingested_image_readiness_claims(id,consent_id,authorization_id) VALUES('{read_id}','{consent}','{read_grant}')")
    database_value(f"INSERT INTO ingested_image_readiness_outcomes(read_id,asset_status,duration_ms) VALUES('{read_id}','Active',8)")
    if history:
        _, page, _ = request("GET", "/v1/media/image-ingestions", bearer_token=token)
        saved = next(row for row in page["data"] if row["consent_id"] == consent)
        assert saved["status"] == "accepted" and saved["reason"] is None and saved["duration_ms"] == 12 and isinstance(saved["observed_at"], str)
    return {"delivery": f"/v1/media/sources/{access}",
            "readiness": f"/v1/media/image-ingestions/{consent}/readiness/{read_id}"}
