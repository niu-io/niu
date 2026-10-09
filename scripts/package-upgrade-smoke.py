#!/usr/bin/env python3
"""Verify a pinned Niu package upgrade and fail-closed migration recovery.

Set NIU_PREVIOUS_IMAGE and NIU_IMAGE to image digests before running this
script. It uses the supplied packages as-is and never builds or removes images.
"""

import json
import importlib.util
import uuid
import os
import re
import secrets
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PREVIOUS_IMAGE = os.environ.get("NIU_PREVIOUS_IMAGE", "").strip()
IMAGE = os.environ.get("NIU_IMAGE", "").strip()
RUN_ID = f"{os.getpid()}-{secrets.token_hex(4)}"
NETWORK = f"niu-package-upgrade-{RUN_ID}"
DATABASE = f"niu-package-upgrade-db-{RUN_ID}"
APP = f"niu-package-upgrade-app-{RUN_ID}"
ADMIN_TOKEN = secrets.token_urlsafe(48)
DATABASE_PASSWORD = secrets.token_urlsafe(32)
VENDOR_ENCRYPTION_KEY = secrets.token_urlsafe(48)
PROVIDER_KEY = secrets.token_urlsafe(24)
CONFIG_PATH = None
VIDEO_UPGRADE = os.environ.get("NIU_UPGRADE_VIDEO") == "1"
ASSET_UPGRADE = os.environ.get("NIU_UPGRADE_ASSETS") == "1"
ANCHOR = f"niu-package-upgrade-network-{RUN_ID}"
PROVIDER = f"niu-package-upgrade-provider-{RUN_ID}"
_video_spec = importlib.util.spec_from_file_location("niu_upgrade_video", ROOT / "scripts/package_video.py")
PACKAGE_VIDEO = importlib.util.module_from_spec(_video_spec)
_video_spec.loader.exec_module(PACKAGE_VIDEO)
_asset_spec = importlib.util.spec_from_file_location("niu_upgrade_assets", ROOT / "scripts/package_asset_upgrade.py")
PACKAGE_ASSETS = importlib.util.module_from_spec(_asset_spec)
_asset_spec.loader.exec_module(PACKAGE_ASSETS)


def migration_versions():
    versions = []
    for path in (ROOT / "crates/storage/migrations").glob("*.sql"):
        match = re.fullmatch(r"(\d+)_.*\.sql", path.name)
        if match:
            versions.append(int(match.group(1)))
    versions.sort()
    if not versions or versions[0] < 1 or len(versions) != len(set(versions)):
        raise RuntimeError("storage migration files must have unique positive numeric versions")
    return versions


LATEST_MIGRATION_VERSION = migration_versions()[-1]


def free_host_port():
    with socket.socket() as listener:
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


def require_container_runtime():
    if shutil.which("docker") is None:
        raise SystemExit("Package qualification requires Docker; no resources were created.")


def docker(*args, check=True):
    result = subprocess.run(["docker", *args], text=True, capture_output=True)
    if check and result.returncode:
        operation = args[0] if args else "command"
        raise RuntimeError(f"Docker {operation} failed (exit {result.returncode})")
    return result


def pinned_image(name, value):
    if not re.search(r"(?:@)?sha256:[0-9a-f]{64}$", value):
        raise SystemExit(f"{name} must be pinned by an image digest")
    return value


def wait_for_database():
    for _ in range(60):
        result = docker(
            "exec", DATABASE, "pg_isready", "-U", "niu", "-d", "niu", check=False
        )
        if result.returncode == 0:
            return
        time.sleep(1)
    raise RuntimeError("PostgreSQL did not become ready")


def database_value(sql):
    return docker(
        "exec", DATABASE, "psql", "-At", "-U", "niu", "-d", "niu", "-c", sql
    ).stdout.strip()


def highest_migration():
    value = database_value(
        "SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations WHERE success"
    )
    return int(value)


def applied_migrations():
    value = database_value("SELECT version FROM _sqlx_migrations WHERE success ORDER BY version")
    return {int(version) for version in value.splitlines() if version.strip()}


def migration_receipts():
    value = database_value(
        "SELECT version, encode(checksum, 'hex'), success, installed_on, execution_time "
        "FROM _sqlx_migrations ORDER BY version"
    )
    return {int(line.split('|', 1)[0]): line for line in value.splitlines() if line.strip()}


def assert_receipts_preserved(previous, current, *, exact=False):
    assert all(current.get(version) == receipt for version, receipt in previous.items()), \
        "upgrade changed an existing migration receipt"
    if exact:
        assert current == previous, "failed startup changed migration receipts"


def first_pending_migration(previous_versions, versions=None):
    versions = migration_versions() if versions is None else versions
    previous_versions = set(previous_versions)
    if any(version < 1 for version in previous_versions) or not previous_versions.issubset(versions):
        raise RuntimeError("previous package schema is outside the current migration history")
    return next((version for version in versions if version not in previous_versions), None)


def request(method, path, *, payload=None, admin=False, token=None):
    body = None if payload is None else json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if admin:
        headers["Authorization"] = f"Bearer {ADMIN_TOKEN}"
    elif token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        f"{BASE_URL}{path}", data=body, headers=headers, method=method
    )
    with LOCAL_OPENER.open(req, timeout=5) as response:
        data = response.read()
        if "application/json" in response.headers.get("Content-Type", ""):
            data = json.loads(data)
        return response.status, data


def wait_for_application():
    last_error = "gateway is not ready"
    for _ in range(60):
        state = docker(
            "inspect", "--format", "{{.State.Status}}", APP, check=False
        )
        if state.returncode == 0 and state.stdout.strip() in {"exited", "dead"}:
            raise RuntimeError("Niu exited before becoming ready")
        try:
            status, body = request("GET", "/readyz")
            if status == 200 and body.get("status") == "ok":
                return
            last_error = f"unexpected readiness response: HTTP {status}"
        except (OSError, urllib.error.URLError, json.JSONDecodeError):
            last_error = "readiness request failed"
        time.sleep(1)
    raise RuntimeError(f"Niu did not become ready: {last_error}")


def start_application(image):
    docker(
        "create",
        "--name",
        APP,
        "--network",
        f"container:{ANCHOR}" if VIDEO_UPGRADE else NETWORK,
        *([] if VIDEO_UPGRADE else ["--publish", f"127.0.0.1:{HOST_PORT}:2555"]),
        "--env",
        f"NIU_DATABASE_URL=postgres://niu:{DATABASE_PASSWORD}@{DATABASE}:5432/niu",
        "--env",
        f"NIU_ADMIN_TOKENS={ADMIN_TOKEN}",
        "--env",
        f"NIU_VENDOR_ENCRYPTION_KEY={VENDOR_ENCRYPTION_KEY}",
        "--env",
        f"UPGRADE_SMOKE_API_KEY={PROVIDER_KEY}",
        "--env",
        "NIU_CONFIG_FILE=/app/niu-package-upgrade-smoke.toml",
        image,
    )
    docker("cp", str(CONFIG_PATH), f"{APP}:/app/niu-package-upgrade-smoke.toml")
    docker("start", APP)


def wait_for_failed_startup():
    for _ in range(30):
        status = docker(
            "inspect", "--format", "{{.State.Status}}", APP, check=False
        )
        if status.returncode == 0 and status.stdout.strip() in {"exited", "dead"}:
            exit_code = docker(
                "inspect", "--format", "{{.State.ExitCode}}", APP
            ).stdout.strip()
            if exit_code != "0":
                result = docker("logs", DATABASE, check=False)
                logs = result.stderr + result.stdout
                if result.returncode != 0 or "NIU_UPGRADE_SMOKE_BLOCKED_DDL" not in logs:
                    raise RuntimeError(
                        "Niu exited before readiness without the injected migration failure"
                    )
                return
            raise RuntimeError("Niu exited successfully while the migration failure remained")
        time.sleep(1)
    raise RuntimeError("Niu stayed running with a conflicting pending migration")


def create_upgrade_records():
    status, organization = request(
        "POST",
        "/admin/v1/organizations",
        payload={"name": "Package upgrade"},
        admin=True,
    )
    assert status == 201
    status, project = request(
        "POST",
        f"/admin/v1/organizations/{organization['id']}/projects",
        payload={"name": "Migration recovery"},
        admin=True,
    )
    assert status == 201
    status, key = request(
        "POST",
        f"/admin/v1/organizations/{organization['id']}/projects/{project['id']}/keys",
        payload={
            "name": "Upgrade smoke client",
            "allowed_models": ["upgrade-smoke"],
            "ttl_seconds": 86400,
        },
        admin=True,
    )
    assert status == 201 and key.get("token")
    return organization, project, key


def assert_records_persist(organization, project, key):
    _, organizations = request("GET", "/admin/v1/organizations", admin=True)
    assert any(item["id"] == organization["id"] for item in organizations["data"])
    _, projects = request(
        "GET",
        f"/admin/v1/organizations/{organization['id']}/projects",
        admin=True,
    )
    assert any(item["id"] == project["id"] for item in projects["data"])
    _, keys = request(
        "GET",
        f"/admin/v1/organizations/{organization['id']}/projects/{project['id']}/keys",
        admin=True,
    )
    assert len(keys["data"]) == 1
    assert keys["data"][0]["id"] == key["id"], "upgrade replaced the workspace key"
    assert keys["data"][0]["name"] == "Upgrade smoke client"
    assert key["token"] not in json.dumps(keys)
    forbidden = {"token", "secret", "credential", "api_key", "api_key_hash"}

    def assert_no_credentials(value):
        if isinstance(value, dict):
            for field, child in value.items():
                assert field.lower() not in forbidden, "upgrade management read exposed credential fields"
                assert_no_credentials(child)
        elif isinstance(value, list):
            for child in value:
                assert_no_credentials(child)

    assert_no_credentials(keys)
    # A surviving row alone does not prove that its issued credential still
    # authenticates, or that its model grant survived the package change.
    status, models = request("GET", "/v1/models", token=key["token"])
    assert status == 200
    assert [item["id"] for item in models["data"]] == ["upgrade-smoke"]


def video_request(method, path, *, bearer_token=None, **kwargs):
    status, body = request(method, path, token=bearer_token, **kwargs)
    return status, body, "application/json"


def fund_video_account(organization):
    status, _ = request("POST", f"/admin/v1/organizations/{organization}/billing/funding/settled",
        admin=True, payload={"currency":"USD", "amount_nanos":"50000000000",
        "channel":"package-fixture", "payment_reference":f"upgrade-video-settled-{str(uuid.UUID(organization))}"})
    assert status == 200


def start_video_fixture():
    # The namespace and counters survive removal of either gateway image.
    docker("run", "--detach", "--name", ANCHOR, "--network", NETWORK,
        "--publish", f"127.0.0.1:{HOST_PORT}:2555", "python:3.13-slim",
        "python", "-c", "import time; time.sleep(3600)")
    docker("create", "--name", PROVIDER, "--network", f"container:{ANCHOR}",
        "--env", f"PROVIDER_KEY={PROVIDER_KEY}", "python:3.13-slim",
        "python", "/mock-provider.py")
    docker("cp", str(ROOT / "tests/fixtures/mock-openai-compatible.py"), f"{PROVIDER}:/mock-provider.py")
    docker("start", PROVIDER)
    # Probe inside the shared namespace; never forward fixture credentials outside it.
    source = "import os,urllib.request; req=urllib.request.Request('http://127.0.0.1:24678/fixture/video-counts',headers={'Authorization':'Bearer '+os.environ['PROVIDER_KEY']}); urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req,timeout=1).read()"
    for _ in range(30):
        if docker("exec", PROVIDER, "python", "-c", source, check=False).returncode == 0:
            return
        time.sleep(0.2)
    raise RuntimeError("video upgrade fixture did not become ready")


def video_counts():
    source = "import os,json,urllib.request; req=urllib.request.Request('http://127.0.0.1:24678/fixture/video-counts',headers={'Authorization':'Bearer '+os.environ['PROVIDER_KEY']}); print(json.dumps(json.load(urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req,timeout=5))))"
    counts = json.loads(docker("exec", PROVIDER, "python", "-c", source).stdout)
    assert set(counts) == {"creates", "queries", "requests"}
    assert all(type(value) is int and value >= 0 for value in counts.values())
    assert counts["creates"] == 2, "package upgrade replayed video generation"
    return counts


def prepare_video_upgrade(organization):
    fund_video_account(organization)
    configuration = PACKAGE_VIDEO.configure_video(video_request, organization,
        "http://127.0.0.1:24678", PROVIDER_KEY,
        lambda supplier: database_value(f"SELECT id FROM provider_offers WHERE provider_id='{str(uuid.UUID(supplier))}' AND model_alias='package-video'"))
    video = PACKAGE_VIDEO.create_video(video_request, organization, defer_completion=True)
    # Preserve a known upstream identity through the image change, then query
    # and settle using the original admission tariff in the upgraded package.
    PACKAGE_VIDEO.replace_fixture_customer_rate(video_request, organization, configuration)
    PACKAGE_VIDEO.create_video_reader(video_request, organization, video)
    uncertain = PACKAGE_VIDEO.create_uncertain_video(video_request, configuration, fund_video_account)
    PACKAGE_VIDEO.assert_uncertain_video_retained(video_request, uncertain)
    video_counts()
    return video, uncertain


def assert_video_upgrade(video, uncertain):
    PACKAGE_VIDEO.assert_video_recovered(video_request, video)
    PACKAGE_VIDEO.assert_video_activity_reconciled(video_request, video)
    PACKAGE_VIDEO.assert_replacement_rate_effective(video_request, video)
    before = video_counts()
    PACKAGE_VIDEO.assert_uncertain_video_retained(video_request, uncertain)
    assert video_counts() == before, "uncertain upgrade recovery contacted upstream"


def start_postgres():
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


def block_schema_changes():
    database_value(
        "CREATE FUNCTION niu_upgrade_smoke_block_ddl() RETURNS event_trigger "
        "LANGUAGE plpgsql AS $$ BEGIN "
        "RAISE EXCEPTION 'NIU_UPGRADE_SMOKE_BLOCKED_DDL'; "
        "END; $$; "
        "CREATE EVENT TRIGGER niu_upgrade_smoke_block_ddl "
        "ON ddl_command_start EXECUTE FUNCTION niu_upgrade_smoke_block_ddl()"
    )


def unblock_schema_changes():
    database_value(
        "DROP EVENT TRIGGER niu_upgrade_smoke_block_ddl; "
        "DROP FUNCTION niu_upgrade_smoke_block_ddl()"
    )


def run_upgrade(previous_image, image):
    global CONFIG_PATH
    config = tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        prefix=".niu-package-upgrade-smoke-",
        suffix=".toml",
        dir=ROOT,
        delete=False,
    )
    CONFIG_PATH = Path(config.name)
    with config:
        # Older and newer AppConfig versions require at least one route even
        # though the upgrade exercise never sends inference traffic.
        config.write(
            "[server]\nrequest_timeout_seconds = 300\n\n"
            "[models.upgrade-smoke]\n"
            'provider = "openai"\n'
            'upstream_model = "upgrade-smoke"\n'
            'api_key_env = "UPGRADE_SMOKE_API_KEY"\n'
        )
    CONFIG_PATH.chmod(0o644)

    start_postgres()
    if VIDEO_UPGRADE:
        start_video_fixture()
    start_application(previous_image)
    wait_for_application()
    previous_version = highest_migration()
    previous_migrations = applied_migrations()
    previous_receipts = migration_receipts()
    pending_migration = first_pending_migration(previous_migrations)
    organization, project, key = create_upgrade_records()
    assert_records_persist(organization, project, key)
    video_state = prepare_video_upgrade(organization["id"]) if VIDEO_UPGRADE else None
    if ASSET_UPGRADE and previous_version < 159:
        raise RuntimeError("asset upgrade verification requires a previous package with asset request retention")
    asset_state = PACKAGE_ASSETS.prepare_asset_upgrade(request, database_value, organization["id"], project["id"]) if ASSET_UPGRADE else None

    docker("stop", "--time", "10", APP)
    docker("rm", APP)
    if pending_migration is not None:
        block_schema_changes()
        start_application(image)
        wait_for_failed_startup()
        applied = database_value(
            f"SELECT count(*) FROM _sqlx_migrations WHERE version = {pending_migration} AND success"
        )
        assert applied == "0", "failed migration was recorded as successful"
        assert highest_migration() == previous_version
        assert applied_migrations() == previous_migrations, "failed startup changed migration receipts"
        assert_receipts_preserved(previous_receipts, migration_receipts(), exact=True)
        docker("rm", "--force", APP)
        unblock_schema_changes()

    start_application(image)
    wait_for_application()
    assert highest_migration() == LATEST_MIGRATION_VERSION
    assert applied_migrations() == set(migration_versions()), "upgrade left unapplied migrations"
    assert_receipts_preserved(previous_receipts, migration_receipts())
    if pending_migration is not None:
        assert database_value(
            f"SELECT count(*) FROM _sqlx_migrations WHERE version = {pending_migration} AND success"
        ) == "1"
    assert database_value(
        f"SELECT count(*) FROM _sqlx_migrations WHERE version = {LATEST_MIGRATION_VERSION} AND success"
    ) == "1"
    assert_records_persist(organization, project, key)
    if asset_state:
        PACKAGE_ASSETS.assert_asset_upgrade(request, database_value, asset_state)
    if video_state:
        PACKAGE_VIDEO.complete_saved_video(video_request, video_state[0])
        assert_video_upgrade(*video_state)
        # Repeat the saved read/reconciliation to detect duplicate settlement.
        assert_video_upgrade(*video_state)


def cleanup():
    for container in (APP, PROVIDER, ANCHOR, DATABASE):
        subprocess.run(["docker", "rm", "--force", container], capture_output=True)
    subprocess.run(["docker", "network", "rm", NETWORK], capture_output=True)
    if CONFIG_PATH:
        CONFIG_PATH.unlink(missing_ok=True)


def main():
    previous_image = pinned_image("NIU_PREVIOUS_IMAGE", PREVIOUS_IMAGE)
    image = pinned_image("NIU_IMAGE", IMAGE)
    if previous_image == image:
        raise SystemExit("NIU_PREVIOUS_IMAGE and NIU_IMAGE must be different digests")
    try:
        run_upgrade(previous_image, image)
        print("Package upgrade smoke passed: workspace records survived upgrade." +
              (" Video state, pinned charges and uncertain liability survived without replay." if VIDEO_UPGRADE else "") +
              (" Asset credentials and prepared requests survived without fabricated authorization or dispatch." if ASSET_UPGRADE else ""))
    finally:
        cleanup()


if __name__ == "__main__":
    require_container_runtime()
    main()
