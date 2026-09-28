#!/usr/bin/env python3
"""Verify a pinned Niu package upgrade and fail-closed migration recovery.

Set NIU_PREVIOUS_IMAGE and NIU_IMAGE to image digests before running this
script. It uses the supplied packages as-is and never builds or removes images.
"""

import json
import os
import re
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
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
MIGRATION_VERSION = 16
CONFIG_PATH = None


def free_host_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


HOST_PORT = free_host_port()
BASE_URL = f"http://127.0.0.1:{HOST_PORT}"
LOCAL_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def docker(*args, check=True):
    result = subprocess.run(["docker", *args], text=True, capture_output=True)
    if check and result.returncode:
        detail = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"Docker command failed: {detail}")
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


def request(method, path, *, payload=None, admin=False):
    body = None if payload is None else json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if admin:
        headers["Authorization"] = f"Bearer {ADMIN_TOKEN}"
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
            result = docker("logs", APP, check=False)
            logs = result.stderr.strip() or result.stdout.strip()
            raise RuntimeError(f"Niu exited before becoming ready: {logs}")
        try:
            status, body = request("GET", "/readyz")
            if status == 200 and body.get("status") == "ok":
                return
            last_error = f"unexpected readiness response: HTTP {status}"
        except (OSError, urllib.error.URLError, json.JSONDecodeError) as error:
            last_error = str(error)
        time.sleep(1)
    raise RuntimeError(f"Niu did not become ready: {last_error}")


def start_application(image):
    docker(
        "run",
        "--detach",
        "--name",
        APP,
        "--network",
        NETWORK,
        "--publish",
        f"127.0.0.1:{HOST_PORT}:2555",
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
        "--volume",
        f"{CONFIG_PATH}:/app/niu-package-upgrade-smoke.toml:ro",
        image,
    )


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
                return
            raise RuntimeError("Niu exited successfully while the migration conflict remained")
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
    assert key["token"] not in json.dumps(keys)


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
    start_application(previous_image)
    wait_for_application()
    previous_version = highest_migration()
    if previous_version != MIGRATION_VERSION - 1:
        raise RuntimeError(
            f"previous package must have schema {MIGRATION_VERSION - 1}, got {previous_version}"
        )
    organization, project, key = create_upgrade_records()

    docker("stop", "--time", "10", APP)
    docker("rm", APP)
    database_value(
        "ALTER TABLE attempts ADD COLUMN provider_model TEXT "
        "CHECK (provider_model IS NULL OR length(provider_model) BETWEEN 1 AND 200)"
    )

    start_application(image)
    wait_for_failed_startup()
    applied = database_value(
        f"SELECT count(*) FROM _sqlx_migrations WHERE version = {MIGRATION_VERSION} AND success"
    )
    assert applied == "0", "failed migration was recorded as successful"
    assert highest_migration() == previous_version
    docker("rm", "--force", APP)

    database_value("ALTER TABLE attempts DROP COLUMN provider_model")
    start_application(image)
    wait_for_application()
    assert highest_migration() == MIGRATION_VERSION
    assert database_value(
        f"SELECT count(*) FROM _sqlx_migrations WHERE version = {MIGRATION_VERSION} AND success"
    ) == "1"
    assert_records_persist(organization, project, key)


def cleanup():
    for container in (APP, DATABASE):
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
        print(
            "Package upgrade smoke passed: schema 15 failed closed on migration 16, "
            "retried with the same image digest, and preserved workspace-scoped records."
        )
    finally:
        cleanup()


if __name__ == "__main__":
    main()
