#!/usr/bin/env python3
"""Exercise single-origin routing, inference, administration, and PostgreSQL persistence."""

import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
import urllib.error
import urllib.request


IMAGE = os.environ.get("NIU_IMAGE", "niu-io/niu:ci")
NETWORK = f"niu-package-smoke-{os.getpid()}"
PROJECT = f"niu-package-smoke-{os.getpid()}"
ROOT = Path(__file__).resolve().parents[1]
DATABASE = ""
APP = ""
PROVIDER = ""
ADMIN_TOKEN = secrets.token_urlsafe(48)
DATABASE_PASSWORD = secrets.token_urlsafe(32)
PROVIDER_KEY = secrets.token_urlsafe(32)
CONFIG_PATH = None
MOCK_PROVIDER_PORT = 24678
BASE_URL = "http://127.0.0.1:2555"
COMPOSE_MODE = len(sys.argv) == 2 and sys.argv[1] == "--compose"
COMPOSE_ENV = None
PREVIOUS_LOCAL_IMAGE = None


def docker(*args):
    result = subprocess.run(
        ["docker", *args], text=True, capture_output=True
    )
    if result.returncode:
        detail = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"docker {' '.join(args)} failed: {detail}")
    return result.stdout.strip()


def compose(*args):
    if COMPOSE_ENV is None:
        raise RuntimeError("Compose environment was not initialized")
    return docker(
        "compose",
        "--project-name",
        PROJECT,
        "--file",
        str(ROOT / "compose.yaml"),
        "--env-file",
        str(COMPOSE_ENV),
        *args,
    )


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
    with urllib.request.urlopen(req, timeout=timeout) as response:
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
    with urllib.request.urlopen(f"{BASE_URL}/workspaces", timeout=5) as response:
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
        env_file.write(f"NIU_ADMIN_TOKENS={ADMIN_TOKEN}\n")
        env_file.write(f"OPENAI_API_KEY={PROVIDER_KEY}\n")

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
        try:
            status, body, _ = request("GET", "/readyz")
            if status == 200 and body.get("status") == "ok":
                return
            last_error = f"unexpected readiness response: {status} {body!r}"
        except (OSError, urllib.error.URLError, json.JSONDecodeError) as error:
            last_error = str(error)
        time.sleep(1)
    logs = subprocess.run(
        ["docker", "logs", APP], text=True, capture_output=True
    ).stderr
    raise RuntimeError(f"Niu did not become ready: {last_error}\n{logs}")


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
            '\n[models.hidden]\n'
            'provider = "openai"\n'
            'upstream_model = "private-fixture-model"\n'
            f'api_base = "http://127.0.0.1:{MOCK_PROVIDER_PORT}/v1"\n'
            'api_key_env = "PROVIDER_KEY"\n'
        )
    CONFIG_PATH.chmod(0o644)


def database_value(sql):
    return docker(
        "exec", DATABASE, "psql", "-At", "-U", "niu", "-d", "niu", "-c", sql
    )


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
        last_error = result.stderr.strip() or result.stdout.strip()
        time.sleep(0.2)
    provider_logs = subprocess.run(
        ["docker", "logs", PROVIDER], text=True, capture_output=True
    )
    raise RuntimeError(
        f"mock provider did not become reachable from the gateway: {last_error}\n"
        f"Provider logs:\n{provider_logs.stdout}{provider_logs.stderr}"
    )


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
        with urllib.request.urlopen(req, timeout=10) as response:
            status = response.status
            body = json.loads(response.read())
            operation_id = response.headers.get("x-niu-operation-id", "")
            attempt_id = response.headers.get("x-niu-attempt-id", "")
    except urllib.error.HTTPError as error:
        response_body = error.read().decode("utf-8", errors="replace")
        app_result = subprocess.run(
            ["docker", "logs", APP], text=True, capture_output=True
        )
        provider_result = subprocess.run(
            ["docker", "logs", PROVIDER], text=True, capture_output=True
        )
        raise RuntimeError(
            f"packaged inference returned HTTP {error.code}: {response_body}\n"
            f"Gateway logs:\n{app_result.stdout}{app_result.stderr}\n"
            f"Provider logs:\n{provider_result.stdout}{provider_result.stderr}"
        ) from error
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
    with urllib.request.urlopen(req, timeout=10) as response:
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


def assert_inference_persisted(attempt_ids):
    assert database_value("SELECT count(*) FROM operations") == "2"
    assert database_value("SELECT count(*) FROM attempts") == "2"
    assert database_value("SELECT count(*) FROM execution_imports") == "0"
    assert database_value("SELECT count(*) FROM supplier_accounts") == "0"
    for attempt_id in attempt_ids:
        assert database_value(
            "SELECT execution || ':' || usage_confidence || ':' || prompt_tokens || ':' || completion_tokens "
            f"FROM attempts WHERE id = '{attempt_id}'"
        ) == "confirmed_completed:provider_reported:3:1"


def verify_backup_restore(organization_id):
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
    if len(sys.argv) > (2 if COMPOSE_MODE else 1):
        raise SystemExit("usage: package-smoke.py [--compose]")
    if COMPOSE_MODE:
        setup_compose()
    else:
        global DATABASE, APP, PROVIDER
        DATABASE = f"niu-package-smoke-db-{os.getpid()}"
        APP = f"niu-package-smoke-app-{os.getpid()}"
        PROVIDER = f"niu-package-smoke-provider-{os.getpid()}"
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
        docker(
            "run",
            "--detach",
            "--name",
            APP,
            "--network",
            NETWORK,
            "--publish",
            "127.0.0.1:2555:2555",
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
            "NIU_CONFIG_FILE=/app/niu-package-smoke.toml",
            "--volume",
            f"{CONFIG_PATH}:/app/niu-package-smoke.toml:ro",
            IMAGE,
        )
        wait_for_application()
        docker(
            "run",
            "--detach",
            "--name",
            PROVIDER,
            "--network",
            f"container:{APP}",
            "--env",
            f"PROVIDER_KEY={PROVIDER_KEY}",
            "--volume",
            f"{ROOT / 'tests/fixtures/mock-openai-compatible.py'}:/mock-provider.py:ro",
            "python:3.13-slim",
            "python",
            "/mock-provider.py",
        )
        wait_for_mock_provider()
    wait_for_application()

    status, _, _ = request("GET", "/healthz")
    assert status == 200, f"liveness returned HTTP {status}"
    status, html, content_type = request("GET", "/")
    assert status == 200 and "text/html" in content_type
    assert "The Agent Gateway" in html, "the packaged product homepage was not served"
    assert 'href="https://niu.io/"' in html, "the homepage canonical URL was not on niu.io"
    assert 'content="#171714"' in html, "the homepage omitted its dark oxhide theme color"
    for destination in ("/docs/", "/models/", "/workspaces/default/"):
        assert f'href="{destination}"' in html, f"the homepage omitted its {destination} route"
    site_css_path = re.search(r'href="(/_astro/[^\"]+\.css)"', html)
    assert site_css_path, "the Astro homepage omitted its stylesheet"
    _, site_css, site_css_type = request("GET", site_css_path.group(1))
    assert site_css_type.startswith("text/css") and "--oxhide" in site_css
    _, site_mark, site_mark_type = request("GET", "/site-assets/brand/niu-mark.png")
    assert site_mark_type.startswith("image/") and len(site_mark) > 100
    sitemap_status, sitemap, sitemap_type = request("GET", "/sitemap.xml")
    assert sitemap_status == 200 and "xml" in sitemap_type
    assert "https://niu.io/models/" in sitemap
    assert request("GET", "/robots.txt")[0] == 200

    catalog_status, catalog_html, catalog_type = request("GET", "/models/")
    assert catalog_status == 200 and "text/html" in catalog_type
    assert "Public model catalog" in catalog_html
    assert 'href="https://niu.io/models/"' in catalog_html
    assert "/site-assets/models.js" in catalog_html
    _, catalog_script, _ = request("GET", "/site-assets/models.js")
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
    assert "Niu Documentation" in docs_html
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
        "/workspaces/smoke/subscriptions?organizationId=org-smoke&projectId=project-smoke&accountId=account-smoke",
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
    assert "niu.io Console" in workspace_html
    bundle_match = re.search(r'<script[^>]+src="([^"]+\.js)"', workspace_html)
    assert bundle_match, "the packaged console HTML did not reference its JavaScript bundle"
    bundle_status, bundle, _ = request("GET", bundle_match.group(1))
    assert bundle_status == 200 and len(bundle) > 500, "the console JavaScript bundle was not served"

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

    attempt_ids = [] if COMPOSE_MODE else [verify_packaged_inference(issued_key["token"])]
    if not COMPOSE_MODE:
        attempt_ids.append(verify_packaged_streaming(issued_key["token"]))

    if COMPOSE_MODE:
        compose("restart", "niu")
    else:
        docker("restart", APP)
    wait_for_application()
    assert_resources_persist(organization_id, project_id, issued_key)
    if attempt_ids:
        assert_inference_persisted(attempt_ids)

    if COMPOSE_MODE:
        verify_backup_restore(organization_id)
        compose("restart", "postgres")
        wait_for_compose_containers()
        wait_for_database()
        wait_for_application()
        assert_resources_persist(organization_id, project_id, issued_key)
    verify_graceful_drain()
    if COMPOSE_MODE:
        print("Compose smoke passed: app and PostgreSQL restarts, backup/restore, graceful drain, migrations, and credential-free admin lists.")
    else:
        print("Packaged image serves the homepage, docs, public catalog and nested workspace routes; API errors stay in their namespaces; streamed inference persists evidence across restart.")


def cleanup():
    if COMPOSE_MODE and COMPOSE_ENV is not None:
        compose("down", "--volumes", "--remove-orphans")
        COMPOSE_ENV.unlink(missing_ok=True)
        if PREVIOUS_LOCAL_IMAGE:
            docker("tag", PREVIOUS_LOCAL_IMAGE, "niu-io/niu:local")
        else:
            subprocess.run(
                ["docker", "image", "rm", "--force", "niu-io/niu:local"],
                capture_output=True,
            )
        return
    for container in (PROVIDER, APP, DATABASE):
        if container:
            subprocess.run(["docker", "rm", "--force", container], capture_output=True)
    subprocess.run(["docker", "network", "rm", NETWORK], capture_output=True)
    if CONFIG_PATH:
        CONFIG_PATH.unlink(missing_ok=True)


try:
    main()
finally:
    cleanup()
