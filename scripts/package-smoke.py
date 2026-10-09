#!/usr/bin/env python3
"""Exercise single-origin routing, inference, administration, and PostgreSQL persistence."""

import json
import hashlib
import importlib.util
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path
import urllib.error
import urllib.request
from urllib.parse import urlsplit


IMAGE = os.environ.get("NIU_IMAGE", "niu-io/niu:ci")
NETWORK = f"niu-package-smoke-{os.getpid()}"
PROJECT = f"niu-package-smoke-{os.getpid()}"
ROOT = Path(__file__).resolve().parents[1]
_video_spec = importlib.util.spec_from_file_location("niu_package_video", ROOT / "scripts/package_video.py")
PACKAGE_VIDEO = importlib.util.module_from_spec(_video_spec)
_video_spec.loader.exec_module(PACKAGE_VIDEO)
_asset_spec = importlib.util.spec_from_file_location("niu_package_assets", ROOT / "scripts/package_asset_upgrade.py")
PACKAGE_ASSETS = importlib.util.module_from_spec(_asset_spec)
_asset_spec.loader.exec_module(PACKAGE_ASSETS)
_listing_spec = importlib.util.spec_from_file_location("niu_package_listings", ROOT / "scripts/package_asset_listing.py")
PACKAGE_LISTINGS = importlib.util.module_from_spec(_listing_spec)
_listing_spec.loader.exec_module(PACKAGE_LISTINGS)
_update_spec = importlib.util.spec_from_file_location("niu_package_updates", ROOT / "scripts/package_asset_updates.py")
PACKAGE_UPDATES = importlib.util.module_from_spec(_update_spec)
_update_spec.loader.exec_module(PACKAGE_UPDATES)
_branding_spec = importlib.util.spec_from_file_location("niu_package_branding", ROOT / "scripts/package_branding.py")
PACKAGE_BRANDING = importlib.util.module_from_spec(_branding_spec)
_branding_spec.loader.exec_module(PACKAGE_BRANDING)
_image_spec = importlib.util.spec_from_file_location("niu_package_images", ROOT / "scripts/package_image_admission.py")
PACKAGE_IMAGES = importlib.util.module_from_spec(_image_spec)
_image_spec.loader.exec_module(PACKAGE_IMAGES)
BRANDING_SMOKE = os.environ.get("NIU_PACKAGE_BRANDING") == "1"
UPDATE_SMOKE = os.environ.get("NIU_PACKAGE_UPDATES") == "1"
LISTING_SMOKE = os.environ.get("NIU_PACKAGE_LISTINGS") == "1"
LOOKUP_SMOKE = os.environ.get("NIU_PACKAGE_LOOKUPS") == "1"
ASSET_SMOKE = os.environ.get("NIU_PACKAGE_ASSETS") == "1"
DATABASE = ""
APP = ""
PROVIDER = ""
NETWORK_ANCHOR = ""
ADMIN_TOKEN = secrets.token_urlsafe(48)
DATABASE_PASSWORD = secrets.token_urlsafe(32)
PROVIDER_KEY = secrets.token_urlsafe(32)
VENDOR_ENCRYPTION_KEY = secrets.token_urlsafe(48)
CONFIG_PATH = None
MOCK_PROVIDER_PORT = 24678


def free_host_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


HOST_PORT = free_host_port()
BASE_URL = f"http://127.0.0.1:{HOST_PORT}"
class LocalRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        source, destination = urlsplit(req.full_url), urlsplit(newurl)
        if req.has_header("Authorization") or destination.username or destination.password:
            return None
        if (source.scheme, source.hostname, source.port) != (destination.scheme, destination.hostname, destination.port):
            return None
        return super().redirect_request(req, fp, code, msg, headers, newurl)


LOCAL_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}), LocalRedirect())
COMPOSE_MODE = len(sys.argv) == 2 and sys.argv[1] == "--compose"
COMPOSE_ENV = None
COMPOSE_OVERRIDE = None
PREVIOUS_LOCAL_IMAGE = None


def require_container_runtime():
    if shutil.which("docker") is None:
        raise SystemExit("Package qualification requires Docker; no resources were created.")


def docker(*args):
    result = subprocess.run(
        ["docker", *args], text=True, capture_output=True
    )
    if result.returncode:
        # Arguments and engine output can repeat credentials passed with -e.
        # Report the operation and status without exposing either source.
        operation = args[0] if args else "command"
        raise RuntimeError(f"Docker {operation} failed (exit {result.returncode})")
    return result.stdout.strip()


def compose(*args):
    if COMPOSE_ENV is None:
        raise RuntimeError("Compose environment was not initialized")
    files = ["--file", str(ROOT / "compose.yaml")]
    if COMPOSE_OVERRIDE:
        files += ["--file", str(COMPOSE_OVERRIDE)]
    return docker("compose", "--project-name", PROJECT, *files,
                  "--env-file", str(COMPOSE_ENV), *args)


def request(method, path, *, payload=None, admin=False, bearer_token=None, timeout=5):
    body = None if payload is None else json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if admin:
        headers["Authorization"] = f"Bearer {ADMIN_TOKEN}"
    elif bearer_token:
        headers["Authorization"] = f"Bearer {bearer_token}"
    req = urllib.request.Request(
        f"{BASE_URL}{path}", data=body, headers=headers, method=method
    )
    with LOCAL_OPENER.open(req, timeout=timeout) as response:
        data = response.read()
        content_type = response.headers.get("Content-Type", "")
        if "application/json" in content_type:
            data = json.loads(data)
        elif content_type.startswith("text/"):
            data = data.decode("utf-8")
        return response.status, data, content_type


def assert_route_error(path, expected_status, *, json_error=False, body_contains=None):
    try:
        request("GET", path)
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        assert error.code == expected_status, f"{path} returned HTTP {error.code}, expected {expected_status}"
        if json_error:
            assert error.headers.get_content_type() == "application/json", f"{path} did not return a JSON API error"
            payload = json.loads(body)
            assert payload.get("error", {}).get("code") == expected_status
        if body_contains:
            assert body_contains in body, f"{path} did not return its expected error page"
        assert 'id="root"' not in body, f"{path} incorrectly fell through to the workspace app"
        return
    raise AssertionError(f"{path} unexpectedly returned a successful response")


def assert_default_workspace_redirect():
    with LOCAL_OPENER.open(f"{BASE_URL}/workspaces", timeout=5) as response:
        assert response.geturl().endswith("/workspaces/default/"), (
            "the workspace root did not redirect to the default workspace"
        )
        assert 'id="root"' in response.read().decode("utf-8")


def wait_for_database():
    for _ in range(60):
        result = subprocess.run(
            ["docker", "exec", DATABASE, "pg_isready", "-U", "niu", "-d", "niu"],
            text=True,
            capture_output=True,
        )
        if result.returncode == 0:
            return
        time.sleep(1)
    raise RuntimeError("PostgreSQL did not become ready")


def wait_for_compose_containers():
    global DATABASE, APP
    DATABASE = compose("ps", "-q", "postgres")
    APP = compose("ps", "-q", "niu")
    if not DATABASE or not APP:
        raise RuntimeError("Compose did not start both the Niu and PostgreSQL services")


def setup_compose():
    global COMPOSE_ENV, PREVIOUS_LOCAL_IMAGE
    env_file = tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", prefix="niu-package-smoke-", delete=False
    )
    COMPOSE_ENV = Path(env_file.name)
    with env_file:
        env_file.write(f"POSTGRES_PASSWORD={DATABASE_PASSWORD}\n")
        env_file.write(f"NIU_HOST_PORT={HOST_PORT}\n")
        env_file.write(f"NIU_ADMIN_TOKENS={ADMIN_TOKEN}\n")
        env_file.write(f"NIU_VENDOR_ENCRYPTION_KEY={VENDOR_ENCRYPTION_KEY}\n")
        env_file.write(f"OPENAI_API_KEY={PROVIDER_KEY}\n")
        env_file.write(f"OPENROUTER_API_KEY={PROVIDER_KEY}\n")
        env_file.write("NIU_AUTH_PUBLIC_ORIGIN=https://package-smoke.example\n")

    existing = subprocess.run(
        ["docker", "image", "inspect", "--format", "{{.Id}}", "niu-io/niu:local"],
        text=True,
        capture_output=True,
    )
    if existing.returncode == 0:
        PREVIOUS_LOCAL_IMAGE = existing.stdout.strip()
    docker("tag", IMAGE, "niu-io/niu:local")
    services = set(compose("config", "--services").splitlines())
    assert services == {"niu", "postgres"}, f"unexpected Compose services: {services}"
    compose("up", "--detach", "--no-build")
    wait_for_compose_containers()
    wait_for_database()


def wait_for_application():
    last_error = None
    for _ in range(60):
        state = subprocess.run(
            ["docker", "inspect", "--format", "{{.State.Status}}", APP],
            text=True, capture_output=True,
        )
        if state.returncode == 0 and state.stdout.strip() in {"exited", "dead"}:
            raise RuntimeError("Niu exited before becoming ready")
        try:
            status, body, _ = request("GET", "/readyz")
            if status == 200 and body.get("status") == "ok":
                return
            last_error = f"unexpected readiness response: HTTP {status}"
        except (OSError, urllib.error.URLError, json.JSONDecodeError):
            last_error = "readiness request failed"
        time.sleep(1)
    raise RuntimeError(f"Niu did not become ready: {last_error}")


def assert_admin_list_has_no_credentials(keys):
    forbidden = {"token", "secret", "credential", "api_key", "api_key_hash"}

    def walk(value):
        if isinstance(value, dict):
            for key, child in value.items():
                assert key.lower() not in forbidden, f"admin list exposed {key}"
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(keys)


def assert_resources_persist(organization_id, project_id, issued_key):
    _, organizations, _ = request("GET", "/admin/v1/organizations", admin=True)
    assert any(item["id"] == organization_id for item in organizations["data"])
    _, projects, _ = request(
        "GET", f"/admin/v1/organizations/{organization_id}/projects", admin=True
    )
    assert any(item["id"] == project_id for item in projects["data"])
    _, keys, _ = request(
        "GET",
        f"/admin/v1/organizations/{organization_id}/projects/{project_id}/keys",
        admin=True,
    )
    assert len(keys["data"]) == 1
    assert_admin_list_has_no_credentials(keys)
    assert issued_key["token"] not in json.dumps(keys), "admin list returned the issued credential"


def direct_smoke_config():
    global CONFIG_PATH
    config = tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        prefix=".niu-package-smoke-",
        suffix=".toml",
        dir=ROOT,
        delete=False,
    )
    CONFIG_PATH = Path(config.name)
    with config:
        config.write(
            "[models.fast]\n"
            'provider = "openai"\n'
            'upstream_model = "fixture-model"\n'
            f'api_base = "http://127.0.0.1:{MOCK_PROVIDER_PORT}/v1"\n'
            'api_key_env = "PROVIDER_KEY"\n'
            'public_catalog = true\n'
            '\n[models.fast.pricing]\n'
            'currency = "USD"\n'
            'api_prompt_rate = 2000000\n'
            'api_completion_rate = 4000000\n'
            'cash_prompt_rate = 1000000\n'
            'cash_completion_rate = 2000000\n'
            'max_input_tokens = 4096\n'
            'max_output_tokens = 64\n'
            '\n[models.hidden]\n'
            'provider = "openai"\n'
            'upstream_model = "private-fixture-model"\n'
            f'api_base = "http://127.0.0.1:{MOCK_PROVIDER_PORT}/v1"\n'
            'api_key_env = "PROVIDER_KEY"\n'
        )
    CONFIG_PATH.chmod(0o644)


def asset_request(method, path, *, payload=None, admin=False, token=None):
    status, data, _ = request(method, path, payload=payload, admin=admin, bearer_token=token)
    return status, data


def database_value(sql):
    return docker(
        "exec", DATABASE, "psql", "-At", "-U", "niu", "-d", "niu", "-c", sql
    )


def assert_packaged_migration_history():
    migrations = list((ROOT / 'crates/storage/migrations').glob('*.sql'))
    expected = sorted(int(path.name.split('_', 1)[0]) for path in migrations)
    assert expected and len(expected) == len(set(expected)), "source migration versions are invalid"
    applied = database_value(
        "SELECT string_agg(version::text, ',' ORDER BY version) FROM _sqlx_migrations WHERE success"
    )
    assert applied == ','.join(map(str, expected)), "packaged schema does not match the source migration history"
    assert database_value("SELECT count(*) FROM _sqlx_migrations WHERE NOT success") == '0'
    checksums = database_value(
        "SELECT version::text || ':' || encode(checksum, 'hex') FROM _sqlx_migrations WHERE success ORDER BY version"
    ).splitlines()
    expected_checksums = [
        f"{int(path.name.split('_', 1)[0])}:{hashlib.sha384(path.read_bytes()).hexdigest()}"
        for path in sorted(migrations, key=lambda path: int(path.name.split('_', 1)[0]))
    ]
    assert checksums == expected_checksums, "packaged migration checksums do not match the source files"


def assert_video_dispatch_count(expected_creates=2):
    # The fixture shares the app network namespace; credentials stay in its environment.
    source = "import os,json,urllib.request; opener=urllib.request.build_opener(urllib.request.ProxyHandler({})); req=urllib.request.Request('http://127.0.0.1:24678/fixture/video-counts',headers={'Authorization':'Bearer '+os.environ['PROVIDER_KEY']}); print(json.dumps(json.load(opener.open(req,timeout=5))))"
    counts = json.loads(docker("exec", PROVIDER, "python", "-c", source))
    assert set(counts) == {'creates','queries','requests'} and all(type(value) is int and value >= 0 for value in counts.values())
    assert counts['requests'] >= counts['creates'] + counts['queries'], 'invalid upstream request counters'
    assert counts['creates'] == expected_creates and counts['queries'] >= 3, 'video recovery repeated generation or lost the upstream job'
    return counts


def wait_for_mock_provider():
    payload = json.dumps(
        {"model": "fixture-model", "messages": [{"role": "user", "content": "ready"}]}
    )
    last_error = "provider did not respond"
    for _ in range(30):
        result = subprocess.run(
            [
                "docker",
                "exec",
                APP,
                "curl",
                "--silent",
                "--show-error",
                "--output",
                "/dev/null",
                "--write-out",
                "%{http_code}",
                "--header",
                f"Authorization: Bearer {PROVIDER_KEY}",
                "--header",
                "Content-Type: application/json",
                "--data",
                payload,
                f"http://127.0.0.1:{MOCK_PROVIDER_PORT}/v1/chat/completions",
            ],
            text=True,
            capture_output=True,
        )
        if result.returncode == 0 and result.stdout == "200":
            return
        last_error = f"probe failed (exit {result.returncode})"
        time.sleep(0.2)
    raise RuntimeError(
        f"mock provider did not become reachable from the gateway: {last_error}"
    )


def initialize_prepaid_account(organization_id, payment_reference="package-smoke-settled"):
    """Create isolated fixture funds; duplicate settlement must never credit twice."""
    base = f"/admin/v1/organizations/{organization_id}/billing"
    funding = {"currency": "USD", "amount_nanos": "50000000000",
               "channel": "package-fixture", "payment_reference": payment_reference}
    for _ in range(2):
        status, result, _ = request("POST", base + "/funding/settled", admin=True, payload=funding)
        assert status == 200 and result["data"]["recorded"] is True
    status, accounts, _ = request("GET", base + "/balance", admin=True)
    assert status == 200, "balance lookup failed"
    assert len(accounts["data"]) == 1
    account = accounts["data"][0]
    assert account["currency"] == funding["currency"]
    assert account["balance_nanos"] == funding["amount_nanos"]
    assert account["credit_limit_nanos"] == "0"
    assert account["reserved_nanos"] == "0"


def assert_prepaid_reconciled(organization_id, attempt_ids):
    # Normalize server references before interpolating them into smoke SQL.
    organization_id = str(uuid.UUID(organization_id))
    attempt_ids = [str(uuid.UUID(value)) for value in attempt_ids]
    assert len(set(attempt_ids)) == len(attempt_ids), "duplicate expected attempts"
    base = f"/admin/v1/organizations/{organization_id}/billing"
    status, accounts, _ = request("GET", base + "/balance", admin=True)
    assert status == 200, "balance lookup failed"
    status, transactions, _ = request("GET", base + "/transactions", admin=True)
    assert status == 200, "transaction lookup failed"
    assert not transactions.get("next_cursor"), "transaction history is incomplete"
    assert transactions.get("has_more") is not True, "transaction history is incomplete"
    assert len(accounts["data"]) == 1, "expected one fixture currency account"
    entries = transactions["data"]
    funding = [entry for entry in entries if entry["kind"] == "funding"]
    charges = [entry for entry in entries if entry["kind"] == "charge"]
    assert len(funding) == 1, "duplicate settlement credited the account twice"
    assert len(charges) == len(attempt_ids), "customer charge ledger did not settle each attempt"
    assert all(int(entry["amount_nanos"]) < 0 for entry in charges)
    account = accounts["data"][0]
    assert account["currency"] == "USD", "unexpected fixture account currency"
    assert all(entry["currency"] == account["currency"] for entry in entries), "mixed-currency ledger history"
    assert int(account["balance_nanos"]) == sum(int(entry["amount_nanos"]) for entry in entries)
    assert account["reserved_nanos"] == "0", "completed requests retained spending reservations"
    assert account["available_nanos"] == account["balance_nanos"]
    for attempt_id in attempt_ids:
        assert database_value(
            f"SELECT count(*) FROM customer_balance_entries e "
            f"JOIN customer_activity_charges c ON c.attempt_id=e.attempt_id "
            f"AND c.organization_id=e.organization_id AND c.project_id=e.project_id "
            f"AND c.currency=e.currency WHERE c.attempt_id='{attempt_id}' "
            f"AND c.organization_id='{organization_id}' AND e.kind='charge' "
            f"AND e.amount_nanos=-c.amount_nanos"
        ) == "1", "customer charge lacks one exact scoped ledger debit"


def verify_packaged_inference(client_token):
    payload = json.dumps(
        {"model": "fast", "messages": [{"role": "user", "content": "hello"}]}
    ).encode()
    req = urllib.request.Request(
        f"{BASE_URL}/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {client_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with LOCAL_OPENER.open(req, timeout=10) as response:
            status = response.status
            body = json.loads(response.read())
            operation_id = response.headers.get("x-niu-operation-id", "")
            attempt_id = response.headers.get("x-niu-attempt-id", "")
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"packaged inference returned HTTP {error.code}") from None
    assert status == 200 and body["model"] == "fast"
    assert body["choices"][0]["message"]["content"] == "fixture completion"
    assert re.fullmatch(r"[0-9a-f-]{36}", operation_id), "inference response omitted its operation id"
    assert re.fullmatch(r"[0-9a-f-]{36}", attempt_id), "inference response omitted its attempt id"
    assert database_value("SELECT count(*) FROM operations") == "1"
    assert database_value("SELECT count(*) FROM attempts") == "1"
    assert database_value("SELECT count(*) FROM execution_imports") == "0"
    assert database_value("SELECT count(*) FROM supplier_accounts") == "0"
    attempt = database_value(
        "SELECT execution || ':' || usage_confidence || ':' || prompt_tokens || ':' || completion_tokens "
        f"FROM attempts WHERE id = '{attempt_id}'"
    )
    assert attempt == "confirmed_completed:provider_reported:3:1", (
        f"packaged inference did not persist provider evidence: {attempt}"
    )
    return attempt_id


def verify_member_session(token, organization_id, project_id):
    status, identity, _ = request("GET", "/admin/v1/session", bearer_token=token)
    assert status == 200 and identity["data"]["kind"] == "operator"
    assert identity["data"]["permissions"]["platform_admin"] is True
    assert identity["data"]["operator"]["organization_id"] == organization_id
    assert identity["data"]["operator"]["project_id"] == project_id
    assert request("GET", "/admin/v1/vendors", bearer_token=token)[0] == 200
    _, organizations, _ = request("GET", "/admin/v1/organizations", bearer_token=token)
    assert [row["id"] for row in organizations["data"]] == [organization_id]


def initialize_member_administrator(organization_id, project_id):
    status, member, _ = request("POST", "/admin/v1/operators", admin=True, payload={
        "organization_id": organization_id, "project_id": project_id,
        "name": "Packaged member", "role": "owner", "expires_in_seconds": 3600,
    })
    assert status == 201
    operator = str(uuid.UUID(member["operator"]["id"]))
    password = secrets.token_urlsafe(32)
    assert request("PUT", f"/admin/v1/operators/{operator}/password", admin=True,
                   payload={"email": "package@example.test", "password": password,
                            "expected_revision": None})[0] == 200
    status, signed_in, _ = request("POST", "/admin/v1/auth/login",
                                  payload={"email": "package@example.test", "password": password})
    assert status == 200
    token = signed_in["token"]
    try:
        request("GET", "/admin/v1/vendors", bearer_token=token)
    except urllib.error.HTTPError as error:
        assert error.code == 403, "ordinary member gained platform administration"
        error.close()
    else:
        raise AssertionError("ordinary member gained platform administration")
    database_value(
        "WITH changed AS (UPDATE admin_operators SET platform_admin=true "
        f"WHERE id='{operator}' AND NOT platform_admin RETURNING id) "
        "INSERT INTO platform_admin_events(operator_id,granted,actor_kind) "
        "SELECT id,true,'database_administrator' FROM changed"
    )
    verify_member_session(token, organization_id, project_id)
    return token


def verify_packaged_streaming(client_token):
    payload = json.dumps(
        {
            "model": "fast",
            "messages": [{"role": "user", "content": "stream hello"}],
            "stream": True,
            "stream_options": {"include_usage": True},
        }
    ).encode()
    req = urllib.request.Request(
        f"{BASE_URL}/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {client_token}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        },
        method="POST",
    )
    with LOCAL_OPENER.open(req, timeout=10) as response:
        assert response.status == 200
        assert response.headers.get_content_type() == "text/event-stream"
        attempt_id = response.headers.get("x-niu-attempt-id", "")
        events = response.read().decode("utf-8")
    assert re.fullmatch(r"[0-9a-f-]{36}", attempt_id), "stream response omitted its attempt id"
    assert "data: [DONE]" in events, "stream terminal event was lost"
    stream_events = [
        json.loads(line.partition(":")[2].strip())
        for line in events.splitlines()
        if line.startswith("data:") and line.partition(":")[2].strip() != "[DONE]"
    ]
    stream_content = "".join(
        choice.get("delta", {}).get("content", "")
        for event in stream_events
        for choice in event.get("choices", [])
    )
    assert stream_content == "stream fixture", "streamed provider content was missing"
    usage = next((event["usage"] for event in stream_events if event.get("usage")), None)
    assert usage and usage["prompt_tokens"] == 3 and usage["completion_tokens"] == 1
    assert database_value("SELECT count(*) FROM operations") == "2"
    assert database_value("SELECT count(*) FROM attempts") == "2"
    assert database_value(
        "SELECT execution || ':' || usage_confidence || ':' || prompt_tokens || ':' || completion_tokens "
        f"FROM attempts WHERE id = '{attempt_id}'"
    ) == "confirmed_completed:provider_reported:3:1", "stream usage evidence was not persisted"
    return attempt_id


def assert_inference_persisted(attempt_ids, extra_attempts=0):
    expected = str(len(attempt_ids) + extra_attempts)
    assert database_value("SELECT count(*) FROM operations") == expected
    assert database_value("SELECT count(*) FROM attempts") == expected
    assert database_value("SELECT count(*) FROM execution_imports") == "0"
    assert database_value("SELECT count(*) FROM supplier_accounts") == "0"
    for attempt_id in attempt_ids:
        assert database_value(
            "SELECT execution || ':' || usage_confidence || ':' || prompt_tokens || ':' || completion_tokens "
            f"FROM attempts WHERE id = '{attempt_id}'"
        ) == "confirmed_completed:provider_reported:3:1"


def database_fingerprints(database):
    if database not in ("niu", "niu_restore_test"):
        raise ValueError("unsupported smoke database")
    # Stop the application first. Never print credential-bearing database rows.
    query = """
CREATE FUNCTION pg_temp.niu_table_signature(table_name text) RETURNS jsonb
LANGUAGE plpgsql AS $body$ DECLARE signature jsonb; BEGIN
EXECUTE format($sql$SELECT jsonb_build_object('count', count(*)::text, 'digest',
md5(COALESCE(string_agg(to_jsonb(t)::text, chr(10) ORDER BY to_jsonb(t)::text), '')))
FROM public.%I t$sql$, table_name) INTO signature;
RETURN signature; END $body$;
CREATE FUNCTION pg_temp.niu_sequence_signature(sequence_name text) RETURNS jsonb
LANGUAGE plpgsql AS $body$ DECLARE signature jsonb; BEGIN
EXECUTE format('SELECT jsonb_build_object(''last_value'', last_value::text, ''is_called'', is_called) FROM public.%I', sequence_name) INTO signature;
RETURN signature; END $body$;
SELECT jsonb_build_object(
'tables', (SELECT COALESCE(jsonb_object_agg(tablename, pg_temp.niu_table_signature(tablename)), '{}'::jsonb) FROM pg_tables WHERE schemaname='public'),
'sequences', (SELECT COALESCE(jsonb_object_agg(sequencename, (to_jsonb(s) - 'last_value') || pg_temp.niu_sequence_signature(sequencename)), '{}'::jsonb) FROM pg_sequences s WHERE schemaname='public'));
"""
    value = docker("exec", DATABASE, "psql", "-Atq", "-v", "ON_ERROR_STOP=1",
                   "-U", "niu", "-d", database, "-c", query)
    result = json.loads(value)
    assert isinstance(result, dict) and isinstance(result.get("tables"), dict) and isinstance(result.get("sequences"), dict), "invalid database fingerprint result"
    return result


def verify_backup_restore(organization_id):
    if COMPOSE_MODE:
        compose("stop", "niu")
    else:
        docker("stop", "--time", "10", APP)
    try:
        restore_database_copy(organization_id)
    finally:
        if COMPOSE_MODE:
            compose("start", "niu")
        else:
            docker("start", APP)
        wait_for_application()


def restore_database_copy(organization_id):
    expected = database_fingerprints("niu")
    assert expected["tables"], "source database has no public tables"
    backup = subprocess.run(
        ["docker", "exec", DATABASE, "pg_dump", "-U", "niu", "-d", "niu"],
        check=True,
        capture_output=True,
    ).stdout
    assert backup, "PostgreSQL produced an empty backup"
    docker("exec", DATABASE, "createdb", "-U", "niu", "niu_restore_test")
    subprocess.run(
        [
            "docker",
            "exec",
            "--interactive",
            DATABASE,
            "psql",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "niu",
            "-d",
            "niu_restore_test",
        ],
        input=backup,
        check=True,
        capture_output=True,
    )
    count = docker(
        "exec",
        DATABASE,
        "psql",
        "-At",
        "-U",
        "niu",
        "-d",
        "niu_restore_test",
        "-c",
        f"SELECT count(*) FROM organizations WHERE id='{organization_id}'",
    )
    assert count == "1", "restored PostgreSQL backup lost the persisted organization"
    restored = database_fingerprints("niu_restore_test")
    assert restored == expected, "restored PostgreSQL backup differs from source table records"
    # The smoke application is stopped. Promote the verified restore so later
    # startup, saved-key and prepaid assertions exercise restored records.
    # Keep the original synthetic database until container cleanup.
    original_name = "niu_backup_source_" + uuid.uuid4().hex
    docker(
        "exec", DATABASE, "psql", "-v", "ON_ERROR_STOP=1", "-U", "niu",
        "-d", "postgres", "-c",
        f"BEGIN; ALTER DATABASE niu RENAME TO {original_name}; "
        "ALTER DATABASE niu_restore_test RENAME TO niu; COMMIT;",
    )


def verify_graceful_drain():
    lock = subprocess.Popen(
        [
            "docker",
            "exec",
            DATABASE,
            "psql",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "niu",
            "-d",
            "niu",
            "-c",
            "BEGIN; LOCK TABLE organizations IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(3); COMMIT",
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        for _ in range(50):
            held = docker(
                "exec",
                DATABASE,
                "psql",
                "-At",
                "-U",
                "niu",
                "-d",
                "niu",
                "-c",
                "SELECT count(*) FROM pg_locks WHERE relation='organizations'::regclass AND mode='AccessExclusiveLock' AND granted",
            )
            if held == "1":
                break
            time.sleep(0.1)
        else:
            raise RuntimeError("could not acquire PostgreSQL lock for graceful-drain test")

        started = threading.Event()
        completed = threading.Event()
        result = {}

        def blocked_request():
            started.set()
            try:
                result["response"] = request(
                    "GET", "/admin/v1/organizations", admin=True, timeout=10
                )
            except Exception as error:  # surfaced below with the drain assertion
                result["error"] = error
            finally:
                completed.set()

        worker = threading.Thread(target=blocked_request, daemon=True)
        worker.start()
        assert started.wait(timeout=2)
        time.sleep(0.3)
        assert not completed.is_set(), "database lock did not hold the in-flight request"
        docker("kill", "--signal=SIGTERM", APP)

        lock_stdout, lock_stderr = lock.communicate(timeout=10)
        assert lock.returncode == 0, f"PostgreSQL lock process failed: {lock_stderr}"
        worker.join(timeout=10)
        assert not worker.is_alive(), "in-flight request did not finish during graceful shutdown"
        assert "error" not in result, f"in-flight request failed during drain: {result.get('error')}"
        response_status, _, _ = result["response"]
        assert response_status == 200, f"in-flight request returned HTTP {response_status} during drain"
        exit_code = docker("wait", APP)
        assert exit_code == "0", f"gateway did not exit cleanly after draining: {exit_code}"
    finally:
        if lock.poll() is None:
            lock.terminate()
            lock.wait(timeout=5)


def main():
    if os.environ.get("NIU_PACKAGE_INGESTION_HISTORY") == "1" and os.environ.get("NIU_PACKAGE_IMAGE_SOURCES") != "1":
        raise SystemExit("NIU_PACKAGE_INGESTION_HISTORY requires NIU_PACKAGE_IMAGE_SOURCES=1")
    if len(sys.argv) > (2 if COMPOSE_MODE else 1):
        raise SystemExit("usage: package-smoke.py [--compose]")
    if COMPOSE_MODE:
        setup_compose()
    else:
        global DATABASE, APP, PROVIDER, NETWORK_ANCHOR
        DATABASE = f"niu-package-smoke-db-{os.getpid()}"
        APP = f"niu-package-smoke-app-{os.getpid()}"
        PROVIDER = f"niu-package-smoke-provider-{os.getpid()}"
        NETWORK_ANCHOR = f"niu-package-smoke-network-{os.getpid()}"
        direct_smoke_config()
        docker("network", "create", NETWORK)
        docker(
            "run",
            "--detach",
            "--name",
            DATABASE,
            "--network",
            NETWORK,
            "--env",
            "POSTGRES_USER=niu",
            "--env",
            f"POSTGRES_PASSWORD={DATABASE_PASSWORD}",
            "--env",
            "POSTGRES_DB=niu",
            "postgres:17",
        )
        wait_for_database()
        # Keep the loopback fixture's network namespace alive across gateway
        # restarts without restarting the fixture or losing its call counters.
        docker(
            "run", "--detach", "--name", NETWORK_ANCHOR,
            "--network", NETWORK,
            "--publish", f"127.0.0.1:{HOST_PORT}:2555",
            "python:3.13-slim", "python", "-c", "import time; time.sleep(3600)",
        )
        docker(
            "create",
            "--name",
            APP,
            "--network",
            f"container:{NETWORK_ANCHOR}",
            "--env",
            f"NIU_DATABASE_URL=postgres://niu:{DATABASE_PASSWORD}@"
            f"{DATABASE}:5432/niu",
            "--env",
            f"NIU_ADMIN_TOKENS={ADMIN_TOKEN}",
            "--env",
            f"OPENAI_API_KEY={PROVIDER_KEY}",
            "--env",
            f"PROVIDER_KEY={PROVIDER_KEY}",
            "--env",
            f"NIU_VENDOR_ENCRYPTION_KEY={VENDOR_ENCRYPTION_KEY}",
            "--env",
            "NIU_CONFIG_FILE=/app/niu-package-smoke.toml",
            "--env",
            "NIU_AUTH_PUBLIC_ORIGIN=https://package-smoke.example",
            IMAGE,
        )
        docker("cp", str(CONFIG_PATH), f"{APP}:/app/niu-package-smoke.toml")
        docker("start", APP)
        wait_for_application()
        docker(
            "create",
            "--name",
            PROVIDER,
            "--network",
            f"container:{APP}",
            "--env",
            f"PROVIDER_KEY={PROVIDER_KEY}",
            "python:3.13-slim",
            "python",
            "/mock-provider.py",
        )
        docker("cp", str(ROOT / "tests/fixtures/mock-openai-compatible.py"), f"{PROVIDER}:/mock-provider.py")
        docker("start", PROVIDER)
        wait_for_mock_provider()
    wait_for_application()

    status, _, _ = request("GET", "/healthz")
    assert status == 200, f"liveness returned HTTP {status}"
    # Community root opens the workspace; the marketing artifact is optional.
    with LOCAL_OPENER.open(f"{BASE_URL}/", timeout=5) as response:
        assert response.url.endswith("/workspaces/default/")
        assert "text/html" in response.headers.get("Content-Type", "")

    favicon_status, favicon, favicon_type = request("GET", "/assets/favicon.ico")
    assert favicon_status == 200 and favicon_type.startswith("image/")
    assert favicon == (ROOT / "branding/assets/favicon.ico").read_bytes(), "packaged dashboard favicon is missing or changed"

    catalog_status, catalog_html, catalog_type = request("GET", "/models/")
    assert catalog_status == 200 and "text/html" in catalog_type
    assert "Public model catalog" in catalog_html
    assert 'href="https://niu.io/models/"' in catalog_html
    assert "/catalog-assets/models.js" in catalog_html
    catalog_css_path = re.search(r'href="(/_catalog/[^\"]+\.css)"', catalog_html)
    assert catalog_css_path, "the public catalog omitted its stylesheet"
    _, catalog_css, catalog_css_type = request("GET", catalog_css_path.group(1))
    assert catalog_css_type.startswith("text/css") and "--oxhide" in catalog_css
    _, catalog_mark, catalog_mark_type = request("GET", "/catalog-assets/brand/niu-mark.png")
    assert catalog_mark_type.startswith("image/") and len(catalog_mark) > 100
    _, catalog_script, _ = request("GET", "/catalog-assets/models.js")
    catalog_script_text = (
        catalog_script.decode("utf-8")
        if isinstance(catalog_script, bytes)
        else catalog_script
    )
    assert "catalog/v1/models" in catalog_script_text
    catalog_api_status, catalog, catalog_api_type = request("GET", "/catalog/v1/models")
    assert catalog_api_status == 200 and "application/json" in catalog_api_type
    assert [item["id"] for item in catalog["data"]] == ["fast"]
    assert catalog["data"][0]["capabilities"]["chat_completions"] is True
    assert "fixture-model" not in json.dumps(catalog), "public catalog exposed the upstream model"

    docs_status, docs_html, docs_type = request("GET", "/docs/")
    assert docs_status == 200 and "text/html" in docs_type
    assert "<title>Build with Niu | niu.io</title>" in docs_html
    assert 'href="https://niu.io/docs/"' in docs_html, "documentation canonical URL omitted its base path"
    docs_page_status, docs_page, _ = request("GET", "/docs/getting-started/")
    assert docs_page_status == 200 and "Getting started" in docs_page
    assert "/docs/_astro/" in docs_page, "documentation assets were not based under /docs"
    for page in (docs_html, docs_page):
        unbased_links = re.findall(r'(?:href|src)="(/[^"#?]+)"', page)
        assert all(link.startswith("/docs/") for link in unbased_links), (
            f"documentation contained a root-relative link outside /docs: {unbased_links}"
        )
    docs_asset = re.search(r'href="([^"]+\.css)"', docs_html)
    assert docs_asset and request("GET", docs_asset.group(1))[0] == 200
    pagefind_status, pagefind_js, _ = request("GET", "/docs/pagefind/pagefind.js")
    assert pagefind_status == 200 and len(pagefind_js) > 100
    for search_asset in (
        "/docs/pagefind/pagefind-entry.json",
        "/docs/pagefind/pagefind-ui.js",
        "/docs/pagefind/pagefind-ui.css",
        "/docs/pagefind/pagefind-modular-ui.js",
        "/docs/pagefind/pagefind-modular-ui.css",
    ):
        assert request("GET", search_asset)[0] == 200, f"docs search asset was not served: {search_asset}"
    sitemap_status, sitemap, _ = request("GET", "/docs/sitemap-index.xml")
    sitemap = sitemap.decode("utf-8") if isinstance(sitemap, bytes) else sitemap
    assert sitemap_status == 200 and "https://niu.io/docs/" in sitemap

    for route in (
        "/workspaces/default/",
        "/workspaces/smoke/executions?organizationId=org-smoke&projectId=project-smoke&executionId=run-smoke",
        "/generations",
        "/generations?mode=video&new=1",
        "/chat",
        "/activity",
        "/activity/logs",
        "/installation",
        "/admin/suppliers",
        "/settings/billing",
    ):
        route_status, route_html, route_content_type = request("GET", route)
        assert route_status == 200 and "text/html" in route_content_type, (
            f"the packaged workspace did not serve its route shell for {route.split('?')[0]}"
        )
        assert 'id="root"' in route_html, "a workspace route response did not contain the React mount point"
    assert_default_workspace_redirect()

    assert_route_error("/docs/missing/release-page/", 404, body_contains="Page not found")
    assert_route_error("/v1/not-a-route", 404, json_error=True)
    assert_route_error("/catalog/v1/not-a-route", 404, json_error=True)
    assert_route_error("/admin/v1/not-a-route", 404, json_error=True)
    assert_route_error("/assets/missing-bundle.js", 404)
    assert_route_error("/unknown-product-page", 404)

    workspace_html = request("GET", "/workspaces/default/")[1]
    assert "<title>niu.io</title>" in workspace_html
    bundle_match = re.search(r'<script[^>]+src="([^"]+\.js)"', workspace_html)
    assert bundle_match, "the packaged dashboard HTML did not reference its JavaScript bundle"
    bundle_status, bundle, _ = request("GET", bundle_match.group(1))
    assert bundle_status == 200 and len(bundle) > 500, "the dashboard JavaScript bundle was not served"

    organization_status, organization, _ = request(
        "POST", "/admin/v1/organizations", payload={"name": "Package smoke"}, admin=True
    )
    assert organization_status == 201
    organization_id = organization["id"]
    project_status, project, _ = request(
        "POST",
        f"/admin/v1/organizations/{organization_id}/projects",
        payload={"name": "Persistence"},
        admin=True,
    )
    assert project_status == 201
    project_id = project["id"]
    key_status, issued_key, _ = request(
        "POST",
        f"/admin/v1/organizations/{organization_id}/projects/{project_id}/keys",
        payload={"name": "Smoke client", "allowed_models": ["fast"], "ttl_seconds": 86400},
        admin=True,
    )
    assert key_status == 201 and issued_key.get("token")
    model_status, models_for_key, _ = request(
        "GET", "/v1/models", bearer_token=issued_key["token"]
    )
    assert model_status == 200 and [item["id"] for item in models_for_key["data"]] == ["fast"]

    PACKAGE_IMAGES.assert_image_admission(request, database_value, issued_key["token"])
    assert models_for_key["data"][0]["customer_pricing"] is None
    billing_path = f"/admin/v1/organizations/{organization_id}/projects/{project_id}/billing"
    tariff_status, tariff, _ = request(
        "POST", billing_path + "/tariffs", admin=True,
        payload={"model_alias": "fast", "currency": "USD", "prompt_rate": "1234567891",
                 "completion_rate": "2000000000", "expected_revision": None},
    )
    assert tariff_status == 200
    expected_customer_price = {
        "revision": tariff["data"]["revision"], "currency": "USD",
        "unit": "nanounits_per_million_tokens", "prompt_rate": "1234567891",
        "completion_rate": "2000000000",
    }
    priced_status, priced_models, _ = request("GET", "/v1/models", bearer_token=issued_key["token"])
    assert priced_status == 200
    assert priced_models["data"][0]["customer_pricing"] == expected_customer_price

    initialize_prepaid_account(organization_id)
    assert_packaged_migration_history()
    member_token = initialize_member_administrator(organization_id, project_id)
    branding_state = PACKAGE_BRANDING.prepare_branding(request, database_value) if BRANDING_SMOKE else None
    asset_state = PACKAGE_ASSETS.prepare_asset_upgrade(asset_request, database_value, organization_id, project_id) if ASSET_SMOKE else None
    if UPDATE_SMOKE and not LISTING_SMOKE:
        raise RuntimeError("NIU_PACKAGE_UPDATES requires NIU_PACKAGE_LISTINGS=1")
    if LOOKUP_SMOKE and not LISTING_SMOKE:
        raise RuntimeError("NIU_PACKAGE_LOOKUPS requires NIU_PACKAGE_LISTINGS=1")
    if LISTING_SMOKE and not asset_state:
        raise RuntimeError("NIU_PACKAGE_LISTINGS requires NIU_PACKAGE_ASSETS=1")
    listing_prepared = PACKAGE_ASSETS.prepare_asset_upgrade(asset_request, database_value, organization_id, project_id, name="Package listing recovery fixture") if LISTING_SMOKE else None
    listing_state = PACKAGE_LISTINGS.prepare_listing_fixture(asset_request, database_value, listing_prepared, VENDOR_ENCRYPTION_KEY, include_lookups=LOOKUP_SMOKE) if LISTING_SMOKE else None
    update_state = PACKAGE_UPDATES.prepare_update_fixture(asset_request, database_value, listing_state) if UPDATE_SMOKE else None
    reconciliation_state = PACKAGE_UPDATES.prepare_reconciliation_fixture(
        asset_request, database_value, listing_state, VENDOR_ENCRYPTION_KEY,
        PACKAGE_LISTINGS.encrypted_page) if UPDATE_SMOKE else None
    if listing_state:
        PACKAGE_LISTINGS.assert_listing_fixture(asset_request, database_value, listing_state)
    if update_state:
        PACKAGE_UPDATES.assert_update_fixture(asset_request, database_value, update_state)
        if update_state['status'] == 'uncertain':
            PACKAGE_UPDATES.assert_update_replay_denied(asset_request, update_state)
    if not COMPOSE_MODE:
        budget_status, _, _ = request(
            "POST",
            f"/admin/v1/organizations/{organization_id}/projects/{project_id}/budget",
            admin=True, payload={"currency": "USD", "limit_nanos": "1000000000"},
        )
        assert budget_status == 201, "fixture procurement budget was not established"
    attempt_ids = [] if COMPOSE_MODE else [verify_packaged_inference(issued_key["token"])]
    if not COMPOSE_MODE:
        attempt_ids.append(verify_packaged_streaming(issued_key["token"]))

    video = None
    if not COMPOSE_MODE:
        video_configuration = PACKAGE_VIDEO.configure_video(request, organization_id,
            f"http://127.0.0.1:{MOCK_PROVIDER_PORT}", PROVIDER_KEY,
            lambda supplier: database_value(f"SELECT id FROM provider_offers WHERE provider_id='{str(uuid.UUID(supplier))}' AND model_alias='package-video'"))
        video = PACKAGE_VIDEO.create_video(request, organization_id,
            after_submit=lambda: PACKAGE_VIDEO.replace_fixture_customer_rate(request, organization_id, video_configuration))
        PACKAGE_VIDEO.assert_replacement_rate_effective(request, video)
        PACKAGE_VIDEO.create_video_reader(request, organization_id, video)
        PACKAGE_VIDEO.assert_video_activity_reconciled(request, video)
        uncertain_video = PACKAGE_VIDEO.create_uncertain_video(request, video_configuration, lambda organization: initialize_prepaid_account(organization, "package-uncertain-settled"))
        before_unknown = assert_video_dispatch_count()
        PACKAGE_VIDEO.assert_uncertain_video_retained(request, uncertain_video)
        assert assert_video_dispatch_count() == before_unknown, 'uncertain recovery contacted upstream'
    billed_attempts = attempt_ids + ([video['id']] if video else [])
    assert_prepaid_reconciled(organization_id, billed_attempts)
    if COMPOSE_MODE:
        compose("restart", "niu")
    else:
        docker("restart", APP)
    wait_for_application()
    assert_resources_persist(organization_id, project_id, issued_key)
    PACKAGE_IMAGES.assert_image_admission(request, database_value, issued_key["token"])
    verify_member_session(member_token, organization_id, project_id)
    if branding_state:
        PACKAGE_BRANDING.assert_branding(request, database_value, branding_state)
    if asset_state:
        PACKAGE_ASSETS.assert_asset_upgrade(asset_request, database_value, asset_state)
    if listing_state:
        PACKAGE_LISTINGS.assert_listing_fixture(asset_request, database_value, listing_state)
    if update_state:
        PACKAGE_UPDATES.assert_update_fixture(asset_request, database_value, update_state)
        if update_state['status'] == 'uncertain':
            PACKAGE_UPDATES.assert_update_replay_denied(asset_request, update_state)
    if update_state:
        PACKAGE_UPDATES.reconcile_saved_fixture(asset_request, database_value, reconciliation_state)
        PACKAGE_UPDATES.dispatch_update_fixture(asset_request, database_value, update_state)
        PACKAGE_UPDATES.assert_update_replay_denied(asset_request, update_state)
    priced_status, restarted_models, _ = request("GET", "/v1/models", bearer_token=issued_key["token"])
    assert priced_status == 200
    assert restarted_models["data"][0]["customer_pricing"] == expected_customer_price
    if video:
        PACKAGE_VIDEO.assert_video_recovered(request, video)
        PACKAGE_VIDEO.assert_video_activity_reconciled(request, video)
        PACKAGE_VIDEO.assert_replacement_rate_effective(request, video)
        before_unknown = assert_video_dispatch_count()
        PACKAGE_VIDEO.assert_uncertain_video_retained(request, uncertain_video)
        assert assert_video_dispatch_count() == before_unknown, 'uncertain recovery contacted upstream'
    assert_prepaid_reconciled(organization_id, billed_attempts)
    if attempt_ids:
        assert_inference_persisted(attempt_ids, extra_attempts=2 if video else 0)

    if reconciliation_state:
        PACKAGE_UPDATES.assert_reconciliation_fixture(asset_request, database_value, reconciliation_state)

    verify_backup_restore(organization_id)
    assert_resources_persist(organization_id, project_id, issued_key)
    verify_member_session(member_token, organization_id, project_id)
    if branding_state:
        PACKAGE_BRANDING.assert_branding(request, database_value, branding_state)
    if asset_state:
        PACKAGE_ASSETS.assert_asset_upgrade(asset_request, database_value, asset_state)
    if listing_state:
        PACKAGE_LISTINGS.assert_listing_fixture(asset_request, database_value, listing_state)
    if update_state:
        PACKAGE_UPDATES.assert_update_fixture(asset_request, database_value, update_state)
        if update_state['status'] == 'uncertain':
            PACKAGE_UPDATES.assert_update_replay_denied(asset_request, update_state)
    if reconciliation_state:
        PACKAGE_UPDATES.assert_reconciliation_fixture(asset_request, database_value, reconciliation_state)
    if video:
        PACKAGE_VIDEO.assert_video_recovered(request, video)
        PACKAGE_VIDEO.assert_video_activity_reconciled(request, video)
        PACKAGE_VIDEO.assert_replacement_rate_effective(request, video)
        before_unknown = assert_video_dispatch_count()
        PACKAGE_VIDEO.assert_uncertain_video_retained(request, uncertain_video)
        assert assert_video_dispatch_count() == before_unknown, 'uncertain recovery contacted upstream'
    assert_prepaid_reconciled(organization_id, billed_attempts)
    if COMPOSE_MODE:
        compose("restart", "postgres")
        wait_for_compose_containers()
        wait_for_database()
        wait_for_application()
        assert_resources_persist(organization_id, project_id, issued_key)
    if video:
        PACKAGE_VIDEO.rotate_fixture_credential(request, video_configuration, secrets.token_urlsafe(32))
        before_rotation = assert_video_dispatch_count()
        PACKAGE_VIDEO.assert_rotated_recovery_blocked(request, video)
        PACKAGE_VIDEO.assert_uncertain_video_retained(request, uncertain_video)
        assert assert_video_dispatch_count() == before_rotation, 'rotated recovery contacted upstream'
        assert_prepaid_reconciled(organization_id, billed_attempts)
    if branding_state:
        PACKAGE_BRANDING.assert_branding(request, database_value, branding_state)
        PACKAGE_BRANDING.reset_branding(request, branding_state)
    assert request("POST", "/admin/v1/auth/logout", bearer_token=member_token, payload={})[0] == 204
    try:
        request("GET", "/admin/v1/session", bearer_token=member_token)
    except urllib.error.HTTPError as error:
        assert error.code == 401, "signed-out member session remained usable"
        error.close()
    else:
        raise AssertionError("signed-out member session remained usable")
    if os.environ.get("NIU_PACKAGE_IMAGE_SOURCES") == "1":
        def configure_images(extra):
            global CONFIG_PATH, COMPOSE_OVERRIDE, PROVIDER
            if COMPOSE_MODE:
                fixture = tempfile.NamedTemporaryFile(mode="w", suffix=".toml", prefix=".niu-source-fixture-", dir=ROOT / "config", delete=False)
                CONFIG_PATH = Path(fixture.name)
                with fixture:
                    fixture.write((ROOT / "config/niu.example.toml").read_text() + extra)
                CONFIG_PATH.chmod(0o644)
                override = tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", prefix="niu-source-compose-", delete=False)
                COMPOSE_OVERRIDE = Path(override.name)
                with override:
                    override.write("services:\n  niu:\n    environment:\n      PROVIDER_KEY: ${OPENROUTER_API_KEY}\n    volumes:\n      - " + json.dumps(str(CONFIG_PATH) + ":/etc/niu/niu.toml:ro") + "\n")
                compose("up", "--detach", "--no-build")
                wait_for_compose_containers()
                wait_for_application()
                PROVIDER = f"niu-package-smoke-inspector-{os.getpid()}"
                docker("create", "--name", PROVIDER, "--network", f"container:{APP}",
                    "--env", f"PROVIDER_KEY={PROVIDER_KEY}", "python:3.13-slim", "python", "/mock-provider.py")
                docker("cp", str(ROOT / "tests/fixtures/mock-openai-compatible.py"), f"{PROVIDER}:/mock-provider.py")
                docker("start", PROVIDER)
                wait_for_mock_provider()
            else:
                CONFIG_PATH.write_text(CONFIG_PATH.read_text() + extra)
                docker("cp", str(CONFIG_PATH), f"{APP}:/app/niu-package-smoke.toml")
        def restart_images():
            docker("restart", APP)
            wait_for_application()
            if COMPOSE_MODE:
                docker("restart", PROVIDER)
                wait_for_mock_provider()
        def recover_images():
            if COMPOSE_MODE:
                compose("restart", "postgres")
                wait_for_compose_containers()
            else:
                docker("restart", DATABASE)
            wait_for_database()
            wait_for_application()
            verify_backup_restore(organization_id)
            if COMPOSE_MODE:
                docker("restart", PROVIDER)
                wait_for_mock_provider()
        PACKAGE_IMAGES.assert_source_lifecycle(request, database_value, issued_key["token"],
            organization_id, project_id, configure_images, restart_images, recover_images,
            history=os.environ.get("NIU_PACKAGE_INGESTION_HISTORY") == "1")
    verify_graceful_drain()
    if COMPOSE_MODE:
        print("Compose smoke passed: app and PostgreSQL restarts, backup/restore, graceful drain, migrations, and credential-free admin lists.")
    else:
        print("Packaged image serves the workspace entry, docs, public catalog and nested workspace routes; API errors stay in their namespaces; streamed inference persists evidence across restart.")


def cleanup():
    if COMPOSE_MODE and COMPOSE_ENV is not None:
        if PROVIDER:
            subprocess.run(["docker", "rm", "--force", PROVIDER], capture_output=True)
        cleanup_failed = False
        try:
            compose("down", "--volumes", "--remove-orphans")
        except Exception:
            cleanup_failed = True
        finally:
            COMPOSE_ENV.unlink(missing_ok=True)
            if COMPOSE_OVERRIDE:
                COMPOSE_OVERRIDE.unlink(missing_ok=True)
            if CONFIG_PATH:
                CONFIG_PATH.unlink(missing_ok=True)
            if PREVIOUS_LOCAL_IMAGE:
                restored = subprocess.run(
                    ["docker", "tag", PREVIOUS_LOCAL_IMAGE, "niu-io/niu:local"],
                    capture_output=True,
                )
                cleanup_failed = cleanup_failed or restored.returncode != 0
            else:
                removed = subprocess.run(
                    ["docker", "image", "rm", "niu-io/niu:local"],
                    capture_output=True,
                )
                cleanup_failed = cleanup_failed or removed.returncode != 0
        if cleanup_failed:
            print("Package smoke cleanup was incomplete; inspect its isolated Compose project.", file=sys.stderr)
        return
    for container in (PROVIDER, APP, NETWORK_ANCHOR, DATABASE):
        if container:
            subprocess.run(["docker", "rm", "--force", container], capture_output=True)
    subprocess.run(["docker", "network", "rm", NETWORK], capture_output=True)
    if CONFIG_PATH:
        CONFIG_PATH.unlink(missing_ok=True)


if __name__ == "__main__":
    require_container_runtime()
    try:
        main()
    finally:
        cleanup()
