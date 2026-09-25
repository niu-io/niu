#!/usr/bin/env python3
"""Import an explicitly selected Niu execution metadata export; no discovery or replay."""
import argparse
import ipaddress
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request
from uuid import UUID

MAX_BYTES = 1_048_576


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def endpoint(base, organization, project):
    parsed = urllib.parse.urlsplit(base)
    try:
        local = ipaddress.ip_address(parsed.hostname or "").is_loopback
    except ValueError:
        local = parsed.hostname == "localhost"
    if (parsed.scheme != "https" and not (parsed.scheme == "http" and local)) or not parsed.hostname:
        raise ValueError("Use HTTPS, or HTTP on a loopback address.")
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        raise ValueError("The gateway URL must contain only its origin.")
    return f"{base.rstrip('/')}/admin/v1/organizations/{UUID(organization)}/projects/{UUID(project)}/execution-imports"


def import_record(base, organization, project, path, token):
    url = endpoint(base, organization, project)
    if not token or "\n" in token or "\r" in token:
        raise ValueError("A valid admin token environment variable is required.")
    with Path(path).open("rb") as source:
        payload = source.read(MAX_BYTES + 1)
    if len(payload) > MAX_BYTES:
        raise ValueError("Execution exports must not exceed 1 MiB.")
    record = json.loads(payload)
    if not isinstance(record, dict) or record.get("schema_version") != 1:
        raise ValueError("Expected a Niu execution record with schema_version 1.")
    # The gateway validates the full strict schema, graph and tenant scope.
    request = urllib.request.Request(
        url, data=payload, method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(request, timeout=30) as response:
        result = json.loads(response.read(MAX_BYTES + 1))
    return str(UUID(result["id"]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", help="Explicitly selected metadata export")
    parser.add_argument("--url", default="http://127.0.0.1:2555")
    parser.add_argument("--organization", required=True)
    parser.add_argument("--project", required=True)
    parser.add_argument("--token-env", default="NIU_ADMIN_TOKEN")
    args = parser.parse_args()
    try:
        record_id = import_record(args.url, args.organization, args.project, args.file, os.environ.get(args.token_env, ""))
    except urllib.error.HTTPError as error:
        # Never print server response bodies or authorization values.
        print(f"Import failed (HTTP {error.code}). Check access, record validity, or conflicting record identity.", file=sys.stderr)
        return 1
    except (ValueError, OSError, KeyError, TypeError, urllib.error.URLError):
        print("Import failed. Check the export, gateway URL, scope IDs, and token environment variable.", file=sys.stderr)
        return 1
    print(json.dumps({"id": record_id}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
