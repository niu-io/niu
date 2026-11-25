#!/usr/bin/env python3
"""Enforce Niu API v1 hygiene and prevent regression to retired route patterns.

Enforced invariants:
- Zero `.dual_route(` calls or `/admin/v1/` mounts in apps/gateway/src/web/routes.rs.
- Zero retired `/api/v1/session/mode` routes in gateway or OpenAPI.
- Zero legacy `/projects` routes or `contracts/route-aliases.json` compatibility aliases.
- Zero untyped bare `{ "type": "object" }` 2xx response schemas in handler-operations.json.
"""
from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


RETIRED_ROUTE_PREFIXES = (
    "/admin/v1",
    "/api/v1/platform/",
    "/api/v1/vendors",
    "/api/v1/providers",
    "/api/v1/provider-memberships",
    "/api/v1/operators",
    "/api/v1/pricing/",
    "/api/v1/routing",
    "/api/v1/incidents",
    "/api/v1/financial-summary",
    "/api/v1/commercial-position",
    "/api/v1/metrics",
    "/v1/branding",
    "/v1/currency",
)


def main() -> int:
    errors: list[str] = []

    if (ROOT / "contracts/route-aliases.json").exists():
        errors.append("contracts/route-aliases.json must stay deleted")

    for required_spec in (
        "contracts/generated/public-openapi.json",
        "contracts/generated/public-openapi.yaml",
    ):
        if not (ROOT / required_spec).exists():
            errors.append(f"Missing generated OpenAPI discovery artifact: {required_spec}")

    routes_src = (ROOT / "apps/gateway/src/web/routes.rs").read_text(encoding="utf-8")
    if ".dual_route(" in routes_src:
        errors.append("routes.rs: retired `.dual_route(` found; mount canonical `/api/v1/*` routes directly")
    for required_route in ('"/openapi.json"', '"/openapi.yaml"'):
        if required_route not in routes_src:
            errors.append(f"routes.rs: missing required root discovery route {required_route}")
    for line_no, line in enumerate(routes_src.splitlines(), start=1):
        stripped = line.strip()
        if stripped.startswith("//") or "concat!" in stripped:
            continue
        if '"/api/v1/session/mode"' in line:
            errors.append(f"routes.rs:{line_no}: retired `/api/v1/session/mode` route found")
        if "/projects" in line:
            errors.append(f"routes.rs:{line_no}: retired `/projects` route reference found: {stripped}")
        if "/by-route/" in line:
            errors.append(f"routes.rs:{line_no}: retired `/by-route/` route reference found: {stripped}")
        for prefix in RETIRED_ROUTE_PREFIXES:
            if f'"{prefix}' in line and "test" not in line.lower():
                errors.append(f"routes.rs:{line_no}: retired `{prefix}` route reference found: {stripped}")

    openapi_text = (ROOT / "contracts/openapi.yaml").read_text(encoding="utf-8")
    if re.search(r"^  /api/v1/session/mode:", openapi_text, re.M):
        errors.append("contracts/openapi.yaml: retired `/api/v1/session/mode` path found")
    if re.search(r"^  [^\n]*/projects(?:/|:)", openapi_text, re.M):
        errors.append("contracts/openapi.yaml: retired `/projects` path found")
    if re.search(r"^  [^\n]*/by-route/", openapi_text, re.M):
        errors.append("contracts/openapi.yaml: retired `/by-route/` path found")
    for prefix in RETIRED_ROUTE_PREFIXES:
        if re.search(rf"^  {re.escape(prefix)}(?:[:/{{]|$)", openapi_text, re.M):
            errors.append(f"contracts/openapi.yaml: retired `{prefix}` path found")

    handlers = json.loads((ROOT / "contracts/generated/handler-operations.json").read_text(encoding="utf-8"))
    for path, item in handlers.get("paths", {}).items():
        if "/projects" in path:
            errors.append(f"handler-operations.json: retired `/projects` path found: {path}")
        if "/by-route/" in path:
            errors.append(f"handler-operations.json: retired `/by-route/` path found: {path}")
        for prefix in RETIRED_ROUTE_PREFIXES:
            if path == prefix or path.startswith(prefix.rstrip("/") + "/"):
                errors.append(f"handler-operations.json: retired `{prefix}` path found: {path}")
        for method, op in item.items():
            if method not in ("get", "post", "put", "patch", "delete"):
                continue
            for code, resp in (op.get("responses") or {}).items():
                if not str(code).startswith("2"):
                    continue
                schema = (((resp or {}).get("content") or {}).get("application/json") or {}).get("schema") or {}
                if schema == {"type": "object"}:
                    errors.append(f"handler-operations.json: untyped 2xx object schema on {method.upper()} {path} ({code})")

    if errors:
        print("API style gate failed:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print("API style gate passed (0 legacy /admin/v1, /projects, /by-route, /platform, /vendors, /providers, /operators, /v1/branding|currency, or untyped 2xx schemas; /openapi.json & /openapi.yaml verified).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
