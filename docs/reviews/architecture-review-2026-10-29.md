# Architecture re-review — 2026-10-29

Status: review-only evidence record for release `v0.2.27`. Live work state stays in Beads epic `niu-4rp`; this document does not carry statuses or a backlog.

**Reviewed revision:** `87640992` (`chore(release): publish v0.2.27`), clean working tree. This re-review compares against the [2026-10-22 review](architecture-review-2026-10-22.md); `58` commits landed in between, including the Credits billing subsystem, migration squash, route de-duplication, provider integrations, and the documentation portal redesign.

## What was run

| Check | Result |
| --- | --- |
| `pnpm --filter @niu-io/dashboard test` | **997 passed / 114 files at review time**, no unhandled rejections |
| `pnpm --filter @niu-io/dashboard build` | pass; initial payload 1,322,378 bytes; chunks > 500 KB |
| Static inventory | 136 route registrations (was 538); 8 migration files (was 361); 370 triggers / 313 functions / 290 tables in the squashed baseline |
| PostgreSQL-backed backend suites | Not executed in this session (CI now gates selected suites) |
| Browser rendering / load / EXPLAIN | Not executed |

## Closed findings (verified fixed or superseded)

- Verification gate and red suite (`niu-4rp.1`): CI now runs on pull requests; dashboard typecheck/build/test and selected PostgreSQL suites are blocking. Fixtures remain non-gating and are documented.
- Payment prerequisite (`niu-4rp.2`): readiness now accepts a per-company funding arrangement, not only a merchant gateway.
- VideoView unhandled rejection (`niu-4rp.3`): dashboard suite green, including Video surfaces.
- Balance capacity (`niu-4rp.5`): `posted_balance_nanos` is maintained transactionally; admission no longer sums the full ledger.
- Admin permission coupling (`niu-4rp.11`): `/admin` now gates on `canManagePlatform` only.
- Route duplication (`niu-4rp.7`): `dual_route` plus a source-parity test; 538 → 136 registrations.
- SDK source coupling (`niu-4rp.8`): zero dashboard imports of `sdks/javascript/src`.
- Readiness semantics (`niu-4rp.18`): `/readyz` checks schema, registry and encryption.
- Migration operation (`niu-4rp.19`): `--migrate-only`, `NIU_SKIP_STARTUP_MIGRATIONS`, squashed baseline.
- Docs/default drift (`niu-4rp.6`): pool default 32, `NIU_ADMIN_TOKENS`, v0.2.27, installer default, publication section all aligned.
- Publication doc (`niu-4rp.16`), money formatting (`niu-4rp.20`), SPA 404 (`niu-4rp.24`), security headers (`niu-4rp.25`), retired dependencies (`niu-4rp.28`), clean-tree provenance (`niu-4rp.13`).

## Carried forward (partially fixed)

- **Hot-path database work (`niu-4rp.4`).** Auth and monetary balance are fixed; readiness still reads currency + payment configuration per gated request, and routing still reads generation/eligibility plus decrypts the credential.
- **Delivery size (`niu-4rp.9`).** Static compression and one-year immutable asset caching exist; initial payload is still 1.32 MB and API JSON is uncompressed.
- **Diagnostics (`niu-4rp.10`).** Capture is configurable but defaults on; two writes per inference request remain.
- **Dashboard consistency (`niu-4rp.14`).** `cn` duplication and dead `useRead` are gone; 285 KB CSS with ~370 unused selectors and no lint config remain.
- **Triggers (`niu-4rp.12`), module size (`niu-4rp.15`), observability (`niu-4rp.17`), naming/UUIDs (`niu-4rp.21`), panics (`niu-4rp.22`), mock readiness (`niu-4rp.23`), demo password (`niu-4rp.26`), silent catches (`niu-4rp.27`)** remain open with narrowed scope.

## New findings

### P0 — Self-hosted quickstart funding command is invalid (`niu-4rp.29`)

`README.md:68` documents `POST /api/v1/organizations/$ORG_ID/balance/grants` with a body containing `currency`. No such route exists; the real route is `POST /api/v1/organizations/{organization}/billing/accounts/{currency}/grants` (`apps/gateway/src/web/routes.rs:238`), and `GrantInput` denies unknown fields (`apps/gateway/src/billing/noncash_grants.rs:10`), so `currency` is rejected. A fresh install following the README fails before inference. The same section references `$NIU_ADMIN_TOKEN` without showing how to derive it.

### P1 — Migration squash upgrade/rollback risk (`niu-4rp.30`)

`crates/storage/src/migration_compatibility.rs` reconstructs migrations `1..=383`, runs them under SQLx's advisory lock, then **separately** deletes the receipts and inserts the version-1 baseline. Two gateways starting concurrently can both pass the pre-collapse check; one then fails on checksum or primary-key conflict. The collapse transaction is outside the migration lock. `scripts/install.sh` backs up PostgreSQL but auto-rollback and `cmd_rollback` only switch images; after the baseline is written a pre-squash binary fails SQLx validation, so rollback needs the dump, which the script does not restore. Embedded parsing uses `assert!`/`expect!`, so malformed baseline content panics at startup. CI's `check-migration-history.py` does verify preserved legacy bytes.

### P1 — Credits admission lacks scoping indexes (`niu-4rp.31`)

`customer_unit_reservations` and `customer_unit_resolutions` are keyed only by `attempt_id`; there is no `(organization_id, project_id)` index and no `customer_unit_restorations(attempt_id)` index. Every Credits admission runs a pending-liability query filtered by organization and, with a limit, `niu_customer_unit_workspace_committed`, which joins reservations/resolutions/restorations. The planner must scan the global ledger, so admission latency grows with total platform Credits usage rather than tenant usage. No `EXPLAIN` was run; index absence is verified from the squashed schema.

### P3 — CI documentation drift (`niu-4rp.32`)

`docs/reference/ci-verification-scope.md` cites `/health/ready` and `/health/live`; the gateway registers `/healthz` and `/readyz` only. It also reported 113 files / 992 tests while the suite reported 114 files / 997 at review time.

### P3 — Code splitting defeated by static imports (`niu-4rp.33`)

The production build reports `settings-page.tsx` as both dynamically and statically imported, preventing the split. Chunks include `index` 730 KB (gzip 276 KB), `ApiReference` 1.56 MB (gzip 466 KB), `markdown` 573 KB and `workspace-events` 463 KB.

## Strengths confirmed in this pass

Credit math is exact (`i128`, reduced ratios, exact purchase conversion, telescoping backing) and the Credits schema is defensive: immutable ledgers, explicit resolutions, reservation extensions for over-bound liability, separate monetary/unit limits, lock ordering, and restore-only-original-ranges refunds. The route-parity test now mechanically prevents the previous drift. Readiness fault injection and workspace-isolation suites are blocking in CI.

## Limits

- No PostgreSQL-backed suite was executed locally; findings about locks/indexes are code-derived.
- No browser was opened; UI findings are structural.
- Credits mode-change and media-billing flows were inspected statically, not exercised end-to-end.
- The migration squash was reasoned from code and `install.sh`; no concurrent-start or downgrade test was run.

## Finding → Bead map (current)

| Area | Beads |
| --- | --- |
| Verification and dashboard | `niu-4rp.1`, `niu-4rp.3` |
| Onboarding and funding | `niu-4rp.2`, **`niu-4rp.29`** |
| Request-path performance | `niu-4rp.4`, `niu-4rp.9`, `niu-4rp.10`, **`niu-4rp.31`** |
| Storage and migrations | `niu-4rp.12`, `niu-4rp.19`, **`niu-4rp.30`** |
| API/frontend boundaries | `niu-4rp.7`, `niu-4rp.8`, `niu-4rp.11`, **`niu-4rp.33`** |
| Observability/readiness | `niu-4rp.17`, `niu-4rp.18` |
| Maintainability | `niu-4rp.14`, `niu-4rp.15`, `niu-4rp.20`, `niu-4rp.21`, `niu-4rp.22`, `niu-4rp.28` |
| Hardening | `niu-4rp.23`, `niu-4rp.25`, `niu-4rp.26`, `niu-4rp.27`, **`niu-4rp.32`** |
