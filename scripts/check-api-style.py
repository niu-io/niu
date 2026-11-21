#!/usr/bin/env python3
"""Enforce Niu API v1 hygiene and prevent regression to retired route patterns.

Milestone A (Phase 1) invariants:
- Zero `.dual_route(` calls or `/admin/v1/` mounts in apps/gateway/src/web/routes.rs.
- Zero retired `/api/v1/session/mode` routes in gateway or OpenAPI.
- Zero untyped bare `{ "type": "object" }` 2xx response schemas in handler-operations.json.
"""
from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main() -> int:
    errors: list[str] = []

    routes_src = (ROOT / "apps/gateway/src/web/routes.rs").read_text(encoding="utf-8")
    if ".dual_route(" in routes_src:
        errors.append("routes.rs: retired `.dual_route(` found; mount canonical `/api/v1/*` routes directly")
    for line_no, line in enumerate(routes_src.splitlines(), start=1):
        if '"/admin/v1' in line and "test" not in line.lower() and not line.strip().startswith("//"):
            errors.append(f"routes.rs:{line_no}: retired `/admin/v1` route reference found: {line.strip()}")
        if '"/api/v1/session/mode"' in line:
            errors.append(f"routes.rs:{line_no}: retired `/api/v1/session/mode` route found")

    openapi_text = (ROOT / "contracts/openapi.yaml").read_text(encoding="utf-8")
    if re.search(r"^  /api/v1/session/mode:", openapi_text, re.M):
        errors.append("contracts/openapi.yaml: retired `/api/v1/session/mode` path found")
    if re.search(r"^  /admin/v1/", openapi_text, re.M):
        errors.append("contracts/openapi.yaml: retired `/admin/v1/` path found")

    handlers = json.loads((ROOT / "contracts/generated/handler-operations.json").read_text(encoding="utf-8"))
    for path, item in handlers.get("paths", {}).items():
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

    print("API style gate passed (0 legacy /admin/v1 or dual_route mounts, 0 retired session/mode, 0 untyped 2xx schemas).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
