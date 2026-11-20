#!/usr/bin/env python3
"""Generate the trigger/function inventory for the squashed Niu schema.

The source of truth is the *effective* schema after applying every embedded
migration in order. Parsing PL/pgSQL text is unreliable (function bodies contain
semicolons, later migrations replace earlier definitions), so this script starts
a disposable PostgreSQL cluster, applies the migrations, and reads pg_catalog.

Requirements: psql, initdb and pg_ctl on PATH (the same prerequisites as
scripts/test-postgres.py). No existing database or credential is read.

Usage:
    python3 scripts/db_schema_inventory.py
    python3 scripts/db_schema_inventory.py --database-url postgres://...
    python3 scripts/db_schema_inventory.py --sql-out /tmp/schema.sql
"""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
MIGRATIONS = REPO / "crates" / "storage" / "migrations"
DOC = REPO / "docs" / "architecture" / "database-trigger-inventory.md"
ATTEMPT_TRIGGERS = DOC.with_name("database-trigger-inventory-attempts.json")

TRIGGER_QUERY = r"""
SELECT json_build_object(
  'trigger_name', t.tgname,
  'table_name', c.relname,
  'timing', CASE
      WHEN (t.tgtype::int & 2) = 2 THEN 'BEFORE'
      WHEN (t.tgtype::int & 64) = 64 THEN 'INSTEAD OF'
      ELSE 'AFTER' END,
  'events', concat_ws(' OR ',
      CASE WHEN (t.tgtype::int & 4) = 4 THEN 'INSERT' END,
      CASE WHEN (t.tgtype::int & 16) = 16 THEN 'UPDATE' END,
      CASE WHEN (t.tgtype::int & 8) = 8 THEN 'DELETE' END,
      CASE WHEN (t.tgtype::int & 32) = 32 THEN 'TRUNCATE' END),
  'row_level', (t.tgtype::int & 1) = 1,
  'update_columns', COALESCE((
      SELECT json_agg(a.attname ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = t.tgrelid AND a.attnum = ANY (t.tgattr)
  ), '[]'::json),
  'function_name', p.proname,
  'function_definition', pg_get_functiondef(p.oid),
  'definition', pg_get_triggerdef(t.oid)
) AS item
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal AND n.nspname = 'public'
ORDER BY c.relname, t.tgname
"""

FUNCTION_QUERY = r"""
SELECT json_build_object(
  'function_name', p.proname,
  'arguments', pg_get_function_identity_arguments(p.oid),
  'returns_trigger', p.prorettype = 'trigger'::regtype,
  'language', l.lanname,
  'definition', pg_get_functiondef(p.oid)
) AS item
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
"""

TABLE_QUERY = r"""
SELECT json_build_object('table_name', c.relname, 'columns', COALESCE((
    SELECT json_agg(a.attname ORDER BY a.attnum)
    FROM pg_attribute a
    WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
), '[]'::json)) AS item
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname
"""

RAISE_RE = re.compile(
    r"RAISE\s+EXCEPTION\s+"
    r"(?:(?:USING\s+ERRCODE\s*=\s*'(?P<code1>[0-9A-Z]+)'"
    r"(?:\s*,\s*MESSAGE\s*=\s*'(?P<message1>[^']*)')?)"
    r"|'(?P<message2>[^']*)'"
    r"(?:\s+USING\s+ERRCODE\s*=\s*'(?P<code2>[0-9A-Z]+)')?)",
    re.IGNORECASE | re.DOTALL,
)


def parse_raises(definition: str) -> list[dict[str, str]]:
    raises = []
    for match in RAISE_RE.finditer(definition):
        code = match.group("code1") or match.group("code2") or "P0001"
        message = (match.group("message1") or match.group("message2") or "").strip()
        raises.append({"code": code, "message": " ".join(message.split())})
    # Deduplicate while preserving order.
    seen = set()
    unique = []
    for item in raises:
        key = (item["code"], item["message"])
        if key not in seen:
            seen.add(key)
            unique.append(item)
    return unique


def source_migrations() -> dict[str, str]:
    """Map every CREATE [OR REPLACE] FUNCTION/TRIGGER name to its last file."""
    sources: dict[str, str] = {}
    for migration in sorted(MIGRATIONS.glob("*.sql")):
        text = migration.read_text(encoding="utf-8", errors="replace")
        for match in re.finditer(
            r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(",
            text,
            re.IGNORECASE,
        ):
            sources["function:" + match.group(1).lower()] = migration.name
        for match in re.finditer(
            r"CREATE\s+TRIGGER\s+([a-zA-Z0-9_]+)", text, re.IGNORECASE
        ):
            sources["trigger:" + match.group(1).lower()] = migration.name
        # Dynamic CREATE TRIGGER statements name the trigger in format strings.
        for match in re.finditer(
            r"CREATE\s+TRIGGER\s+%I", text, re.IGNORECASE
        ):
            for name in re.findall(
                r"EXECUTE\s+format\(\s*'CREATE\s+TRIGGER\s+([a-zA-Z0-9_]+)", text
            ):
                sources["trigger:" + name.lower()] = migration.name
    return sources


def test_index() -> tuple[dict[str, list[str]], list[str]]:
    """Return test names. Coverage is intentionally a name check, not a body grep."""
    roots = [
        REPO / "crates" / "storage" / "tests",
        REPO / "apps" / "gateway" / "src" / "web" / "tests",
        REPO / "apps" / "gateway" / "tests",
        REPO / "crates" / "storage" / "src",
        REPO / "apps" / "gateway" / "src",
    ]
    index: dict[str, list[str]] = {}
    names: list[str] = []
    test_fn = re.compile(
        r"^\s*async\s+fn\s+([a-zA-Z0-9_]+)\s*\(|^\s*fn\s+([a-zA-Z0-9_]+)\s*\(",
        re.MULTILINE,
    )
    for root in roots:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*.rs")):
            try:
                text = path.read_text(encoding="utf-8")
            except OSError:
                continue
            if "sqlx::test" not in text and "#[test]" not in text and "#[tokio::test]" not in text:
                continue
            matches = list(test_fn.finditer(text))
            for position, match in enumerate(matches):
                name = match.group(1) or match.group(2)
                end = matches[position + 1].start() if position + 1 < len(matches) else len(text)
                # Include the attribute immediately above the function signature.
                body = text[max(0, match.start() - 400):end]
                if "sqlx::test" not in body and "#[test]" not in body and "#[tokio::test]" not in body:
                    continue
                names.append(name)
    return index, names


def humanize(name: str) -> str:
    return name.replace("_", " ").strip()


def attempt_path(table: str, columns: list[str], trigger_name: str) -> str:
    if table == "attempts":
        return "direct attempt"
    if "attempt_id" in columns or table.startswith(
        ("attempt_", "customer_attempt_", "provider_attempt_", "key_attempt_", "managed_attempt_")
    ):
        return "attempt-adjacent"
    domain = table + " " + trigger_name
    if re.search(
        r"charge|billing|balance|invoice|payment|tariff|price|cost|earning|settlement|"
        r"credit|funding|topup|grant|reservation|spending|ledger|financial|refund|purchase",
        domain,
        re.IGNORECASE,
    ):
        return "billing"
    if re.search(
        r"route|offer|qualification|guardrail|pool|routing|publication|retail|model|provider",
        domain,
        re.IGNORECASE,
    ):
        return "route/supply"
    return "none"


def run_psql(url: str, sql: str) -> str:
    result = subprocess.run(
        ["psql", url, "--no-psqlrc", "--no-align", "--tuples-only", "--command", sql],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )
    return result.stdout.strip()


def start_cluster() -> tuple[str, tempfile.TemporaryDirectory, Path]:
    for executable in ("psql", "initdb", "pg_ctl"):
        if shutil.which(executable) is None:
            raise SystemExit(f"{executable} must be installed and available on PATH")
    directory = tempfile.TemporaryDirectory(prefix="niu-schema-inventory-")
    root = Path(directory.name)
    root.chmod(0o700)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    password = secrets.token_urlsafe(32)
    password_file = root / "password"
    password_file.write_text(password)
    password_file.chmod(0o600)
    subprocess.run(
        ["initdb", "-D", str(root / "data"), "-U", "postgres", "--auth=scram-sha-256", "--pwfile", str(password_file)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=True,
    )
    subprocess.run(
        [
            "pg_ctl", "-D", str(root / "data"), "-l", str(root / "postgres.log"), "-o",
            f"-h 127.0.0.1 -p {port} -k {shlex.quote(str(root))}", "-w", "start",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=True,
    )
    database = f"niu_inventory_{port}"
    subprocess.run(
        ["createdb", "-h", "127.0.0.1", "-p", str(port), "-U", "postgres", database],
        env={**os.environ, "PGPASSWORD": password},
        check=True,
        stdout=subprocess.DEVNULL,
    )
    url = f"postgres://postgres:{password}@127.0.0.1:{port}/{database}"
    environment = {**os.environ, "PGPASSWORD": password}
    for migration in sorted(MIGRATIONS.glob("*.sql")):
        result = subprocess.run(
            [
                "psql", "-h", "127.0.0.1", "-p", str(port), "-U", "postgres",
                "-d", database, "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-1", "-q",
                "-f", str(migration),
            ],
            env=environment,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if result.returncode != 0:
            subprocess.run(
                ["pg_ctl", "-D", str(root / "data"), "-m", "immediate", "-w", "stop"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            raise SystemExit(f"migration failed: {migration.name}\n{result.stderr}")
    return url, directory, root


def stop_cluster(root: Path) -> None:
    subprocess.run(
        ["pg_ctl", "-D", str(root / "data"), "-m", "fast", "-w", "stop"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )


def classify_code(code: str) -> str | None:
    known = {
        "P0005": "unauthorized",
        "P0006": "conflict",
        "P0007": "account unavailable",
        "P0008": "budget exceeded",
        "P0009": "invalid price",
        "P0010": "guardrail conflict",
        "P0011": "personal dispatch conflict",
        "P0020": "key request rate",
        "P0021": "key concurrency",
        "P0022": "key token rate",
        "P0023": "key token bound",
        "P0024": "route changed",
        "P0025": "vendor request rate",
        "P0026": "key request disabled",
        "P0027": "vendor request disabled",
        "P0028": "request deadline",
        "P0029": "routing publication",
        "P0039": "procurement unavailable",
        "P0040": "grant correction conflict",
    }
    return known.get(code)


def markdown(triggers: list[dict], functions: list[dict], tables: list[dict], generated: str) -> str:
    table_columns = {row["table_name"]: row["columns"] for row in tables}
    attempts = [t for t in triggers if t["table_name"] == "attempts"]
    tested = sum(1 for t in triggers if t["tests"])
    lines: list[str] = []
    lines.append("# Database trigger and function inventory")
    lines.append("")
    lines.append(
        "Generated from the effective schema after applying every embedded migration "
        f"(0001 through the latest) on {generated}. Do not edit by hand; regenerate with:"
    )
    lines.append("")
    lines.append("```sh")
    lines.append("python3 scripts/db_schema_inventory.py")
    lines.append("```")
    lines.append("")
    lines.append(
        f"**{len(triggers)} triggers, {len(functions)} public functions and {len(tables)} tables.** "
        f"{len(attempts)} triggers fire on `attempts`; {tested} triggers have a table-qualified "
        "named test."
    )
    lines.append("")
    lines.append("## How to read this inventory")
    lines.append("")
    lines.append(
        "- **Invariant** is derived from the RAISE messages in the trigger function. A trigger "
        "with no RAISE is a side-effect trigger (audit, denormalization or recovery), not a guard. "
        "This derivation is evidence, not a proof: read the function body before changing it."
    )
    lines.append(
        "- **Attempt path** is a heuristic classification: `direct attempt` fires on `attempts`; "
        "`attempt-adjacent` names an `attempt_id` or an attempt table; `billing`, `route/supply` "
        "and `none` group the rest by table/trigger name. It identifies the rules an attempt "
        "transaction can reach; it does not prove every path is reachable."
    )
    lines.append(
        "- **Named test** lists test functions whose name contains `trigger_<table>_<trigger>`. It is "
        "deliberately strict: a behavioral test that never names the trigger does not count. "
        "See the coverage boundary at the end for untested guards."
    )
    lines.append(
        "- **Source migration** is the last migration file that contains a CREATE/REPLACE "
        "statement for the name. Dynamic SQL can move that evidence; the runtime definition is "
        "the catalog text in this document."
    )
    lines.append("")
    lines.append("## Attempt-path triggers")
    lines.append("")
    lines.append(
        "These are the rules that can reject an attempt transaction. This is the prioritized "
        "review surface for `crates/storage` and `apps/gateway`."
    )
    lines.append("")
    lines.append("| Trigger | Timing / event | Function | Invariant (derived) | Named test |")
    lines.append("| --- | --- | --- | --- | --- |")
    for trigger in attempts:
        invariant = trigger["invariant"] or "side-effect; no RAISE"
        lines.append(
            f"| `{trigger['trigger_name']}` | {trigger['timing']} {trigger['events']} | "
            f"`{trigger['function_name']}` | {invariant} | {trigger['test_display']} |"
        )
    lines.append("")
    lines.append("## Rules moved into Rust-owned transactions")
    lines.append("")
    lines.append(
        "`require_gateway_retry_deadline` was removed from `attempts` in migration "
        "`0429_gateway_retry_deadline_rust_owned.sql`. `Store::mark_dispatched` performs "
        "the same static deadline check after taking the attempt row lock and returns "
        "`StoreError::GatewayRequestDeadlineExceeded` (SQLSTATE `P0028` meaning). The "
        "Rust-owned rule is tested by `trigger_attempts_require_gateway_retry_deadline_is_rust_owned`."
    )
    lines.append("")
    lines.append("## Complete trigger inventory")
    lines.append("")
    current_table = None
    for trigger in triggers:
        if trigger["table_name"] != current_table:
            current_table = trigger["table_name"]
            lines.append(f"### `{current_table}`")
            lines.append("")
            lines.append("| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |")
            lines.append("| --- | --- | --- | --- | --- | --- |")
        invariant = trigger["invariant"] or "side-effect; no RAISE"
        columns = trigger["update_columns"]
        event = f"{trigger['timing']} {trigger['events']}"
        if columns:
            event += " (" + ", ".join(columns) + ")"
        lines.append(
            f"| `{trigger['trigger_name']}` | {event} | `{trigger['function_name']}` | "
            f"{invariant} | {trigger['attempt_path']} | {trigger['test_display']} |"
        )
    lines.append("")
    lines.append("## Function inventory")
    lines.append("")
    lines.append(
        "All public functions in the effective schema. Trigger functions are marked; helper "
        "functions are listed because they carry the same invariants and are callable directly."
    )
    lines.append("")
    lines.append("| Function | Arguments | Returns trigger | Trigger users | Raised codes | Source migration |")
    lines.append("| --- | --- | --- | --- | --- | --- |")
    for function in functions:
        users = ", ".join(f"`{name}`" for name in function["trigger_users"]) or "-"
        codes = ", ".join(f"`{code}`" for code in function["codes"]) or "-"
        lines.append(
            f"| `{function['function_name']}` | {function['arguments'] or '-'} | "
            f"{'yes' if function['returns_trigger'] else 'no'} | {users} | {codes} | "
            f"{function['source_migration'] or 'dynamic'} |"
        )
    lines.append("")
    lines.append("## Coverage boundary")
    lines.append("")
    lines.append(
        f"Named-test coverage is **{tested}/{len(triggers)} triggers** and "
        f"**{sum(1 for t in attempts if t['tests'])}/{len(attempts)} attempt triggers**. "
        "The remainder are inventoried but not claimed as tested. The tests under "
        "`crates/storage/tests/trigger_guards.rs` cover the prioritized slice; "
        "`docs/reviews/database-trigger-guard-coverage-2026-11-06.md` lists every untested "
        "attempt guard with the fixture reason. This document does not claim each of the "
        "schema's triggers has a test."
    )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", help="Use an already-migrated database instead of starting a cluster")
    parser.add_argument("--sql-out", type=Path, help="Also dump the effective schema to this path")
    args = parser.parse_args()

    directory = None
    root = None
    url = args.database_url
    if not url:
        url, directory, root = start_cluster()

    try:
        triggers = json.loads(run_psql(url, "SELECT COALESCE(json_agg(x.item), '[]'::json) FROM (" + TRIGGER_QUERY + ") x"))
        functions = json.loads(run_psql(url, "SELECT COALESCE(json_agg(x.item), '[]'::json) FROM (" + FUNCTION_QUERY + ") x"))
        tables = json.loads(run_psql(url, "SELECT COALESCE(json_agg(x.item), '[]'::json) FROM (" + TABLE_QUERY + ") x"))
        if args.sql_out:
            with args.sql_out.open("w", encoding="utf-8") as handle:
                subprocess.run(["pg_dump", "--schema-only", "--no-owner", "--no-privileges", url], stdout=handle, check=True)
    finally:
        if root is not None:
            stop_cluster(root)
        if directory is not None:
            directory.cleanup()

    sources = source_migrations()
    table_columns = {row["table_name"]: row["columns"] for row in tables}
    tests, test_names = test_index()
    generated = subprocess.run(
        ["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"], text=True, stdout=subprocess.PIPE, check=True
    ).stdout.strip()

    trigger_users: dict[str, list[str]] = {}
    for trigger in triggers:
        trigger_users.setdefault(trigger["function_name"], []).append(trigger["trigger_name"])

    for trigger in triggers:
        raises = parse_raises(trigger["function_definition"])
        messages = []
        for item in raises:
            if item["message"] and item["message"] not in messages:
                messages.append(item["message"])
        if messages:
            trigger["invariant"] = "; ".join(messages).replace("|", "\\|")
        else:
            trigger["invariant"] = ""
        trigger["attempt_path"] = attempt_path(
            trigger["table_name"], table_columns.get(trigger["table_name"], []), trigger["trigger_name"]
        )
        trigger["source_migration"] = sources.get("trigger:" + trigger["trigger_name"].lower(), "dynamic")
        # Coverage is table-qualified: the same trigger name (for example
        # platform_currency_guard) exists on several tables, and a test for one
        # instance must not count as coverage for the others.
        coverage_key = f"trigger_{trigger['table_name']}_{trigger['trigger_name']}"
        trigger["tests"] = sorted(name for name in test_names if coverage_key in name)
        trigger["test_display"] = ", ".join(f"`{name}`" for name in trigger["tests"]) or "untested"
        trigger["codes"] = sorted({item["code"] for item in raises})
        trigger["raises"] = raises

    for function in functions:
        raises = parse_raises(function["definition"])
        function["codes"] = sorted({item["code"] for item in raises})
        function["raises"] = raises
        function["trigger_users"] = sorted(set(trigger_users.get(function["function_name"], [])))
        function["source_migration"] = sources.get("function:" + function["function_name"].lower(), "dynamic")

    DOC.parent.mkdir(parents=True, exist_ok=True)
    DOC.write_text(markdown(triggers, functions, tables, generated), encoding="utf-8")
    ATTEMPT_TRIGGERS.write_text(
        json.dumps(
            {
                "generated": generated,
                "counts": {
                    "triggers": len(triggers),
                    "attempt_triggers": sum(1 for t in triggers if t["table_name"] == "attempts"),
                    "functions": len(functions),
                    "tables": len(tables),
                },
                "triggers": triggers,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        f"wrote {DOC.relative_to(REPO)} ({len(triggers)} triggers, {len(functions)} functions) and "
        f"{ATTEMPT_TRIGGERS.relative_to(REPO)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
