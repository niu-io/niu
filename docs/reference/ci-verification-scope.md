# CI Verification Scope and Gating Contract

This document defines the continuous integration (CI) gating contract across `.github/workflows/ci.yml`, `.github/workflows/backend.yml`, and `.github/workflows/fixtures.yml`.

## 1. Pull Request and Main-Branch Blocking Gates

Every pull request and push to `main` (or release tag) is gated by blocking checks in `.github/workflows/ci.yml` and `.github/workflows/backend.yml`. A failure in any of the suites below fails the workflow run and blocks merge or release qualification.

### 1.1 Web, Contract, and SDK Blocking Gates (`.github/workflows/ci.yml` — `web` job)

Triggered on `push` (`main`, tags `*`), `pull_request`, and `workflow_dispatch`:

- **Public boundary & license verification**:
  - `python3 scripts/check-public-boundary.py --root . --tracked-tree --check-build-inputs`
  - `node scripts/verify-js-licenses.mjs`
  - `python3 scripts/check-public-boundary.py --root . apps/dashboard/dist apps/docs/dist apps/catalog/dist`
- **Dashboard typecheck, production build, and full behavioral test suite (114 test files; the Vitest run is authoritative for the test count)**:
  - `pnpm --filter @niu-io/dashboard check`
  - `pnpm --filter @niu-io/dashboard build`
  - `pnpm --filter @niu-io/dashboard test`
- **OpenAPI contract, audience views, and SDK parity**:
  - `pnpm check:api`
  - `pnpm --filter @niu-io/docs test:api`
  - `pnpm --filter @niu-io/docs check && pnpm --filter @niu-io/docs build`
  - `pnpm check:catalog && pnpm build:catalog`
- **Official SDK & MCP typechecks, builds, and unit tests**:
  - `pnpm --dir sdks/javascript run check && pnpm --dir sdks/javascript run build && pnpm --dir sdks/javascript test`
  - `pnpm --dir sdks/agent-connect run check && pnpm --dir sdks/agent-connect run build && pnpm --dir sdks/agent-connect test`
  - `pnpm --dir sdks/mcp run check && pnpm --dir sdks/mcp run build && pnpm --dir sdks/mcp test`

### 1.2 Rust Static and PostgreSQL 17 Behavioral Blocking Gates (`.github/workflows/backend.yml` — `rust` job)

Triggered on `push` (`main`), `pull_request` (matching backend/contract paths), and `workflow_dispatch`, backed by a live `postgres:17` service container (`DATABASE_URL=postgres://niu_test:niu_test@127.0.0.1:5432/niu_test`):

- **Static & contract integrity gates**:
  - `cargo +1.98.0 fmt --all -- --check`
  - `python3 scripts/verify-imports.py`
  - `python3 scripts/extract-handler-openapi.py --check`
  - `python3 scripts/check-openapi-entrypoints.py`
  - `cargo +1.98.0 clippy --locked --workspace --all-targets -- -D warnings`
  - `cargo +1.98.0 test --locked --workspace --no-run`
- **Blocking PostgreSQL 17 behavioral suites**:
  - `cargo +1.98.0 test --locked -p niu-storage --test billing --test platform_currency -- --include-ignored`
    - Verifies double-entry ledger invariants, `posted_balance_nanos` O(1) statement-level transition-table maintenance, 8-way concurrent reservation contention, trigger SQLSTATE/CONSTRAINT error mapping, and singleton platform currency enforcement.
  - `cargo +1.98.0 test --locked -p niu-gateway --bin niu-gateway web::tests::observability::readiness_fault_injection_checks_schema_registry_and_encryption_while_liveness_stays_ok -- --include-ignored`
    - Verifies `/readyz` vs `/healthz` separation and fault-injected database schema, model registry, and encryption key checks.
  - `cargo +1.98.0 test --locked -p niu-gateway --bin niu-gateway web::tests::admin::workspace_scoped_customer_management_aliases_preserve_parity_and_deny_foreign_workspaces -- --include-ignored`
    - Verifies canonical `/api/v1/workspaces/{workspace}/...` and legacy customer-management route parity and cross-workspace isolation (`404 Not Found` on foreign workspaces).

### 1.3 Container Package and Migration Immutability Gates (`.github/workflows/ci.yml` — `package` job)

- `python3 scripts/check-migration-history.py previous-source/crates/storage/migrations crates/storage/migrations`
- `docker buildx build --load --tag niu-io/niu:ci .`
- Runtime image user (`10001:10001`), asset completeness, and `check-public-boundary.py` scan on extracted `/app`.

## 2. Non-Gating Diagnostic Suites (`.github/workflows/fixtures.yml`)

Long-running full-workspace fixture sweeps and mock-upstream smoke scripts in `.github/workflows/fixtures.yml` remain scheduled/callable with `continue-on-error: true` for diagnostic visibility while legacy UI test fixtures (such as pre-workspace-slug mock URL fixtures in older integration files) are incrementally migrated. Only the blocking suites listed in Section 1 establish merge and release qualification.
