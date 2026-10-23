# Architecture review — 2026-10-22

Status: review-only evidence record. Work state lives in Beads epic `niu-4rp`; this document records the scope, method, findings and their limits. It is not a second backlog and carries no live owner/status table.

**Reviewed revision:** commit `645f7318` plus the uncommitted working set present at review time (173 tracked files changed, +53,475/−26,010, plus untracked dashboard and docs files). CI evaluates committed code, so this review describes a tree that no pipeline had evaluated (see `niu-4rp.13`).

## Scope and method

Inspected: gateway request path and admission, storage schema/migrations and ledger queries, pricing arithmetic, dashboard architecture and built output, CI/deployment configuration, and operator documentation.

Not executed: PostgreSQL-backed backend suites, browser rendering/responsive layouts, load or `EXPLAIN ANALYZE` runs, and live payment flows. Performance findings are code-derived and labelled as such; findings marked "verify" need reproduction before code changes.

Executed:

| Check | Result |
| --- | --- |
| `pnpm --filter @niu-io/dashboard check` | pass |
| `pnpm --filter @niu-io/dashboard test` | 24 failed / 886 passed (910), 8 failed files, unhandled rejections in `VideoView` |
| Static inventory | 538 route registrations, 219 admin/API pairs, 361 migrations, 330 triggers, 286 functions, 266 tables, 52 SDK source imports |

## Critical

- **No behavioural verification gates a merge; the dashboard suite is red** (`niu-4rp.1`). Pull requests get formatting, Clippy and test compilation only; the fixture workflows are explicitly non-gating. On the reviewed tree, 24 dashboard tests fail and `VideoView` throws an unhandled rejection from an unvalidated SDK response (`niu-4rp.3`).

## High

- **Payment readiness blocks the documented self-hosted flow** (`niu-4rp.2`). Inference and workspace APIs return 503 until a payment gateway is configured, while the README quickstart omits that prerequisite. The UX record describes the gate as intentional, so the contract and docs must be reconciled.
- **Per-request database amplification** (`niu-4rp.4`). Auth opens a repeatable-read transaction for one indexed row; the readiness gate adds two uncached queries; routing adds generation/eligibility/credential reads plus decryption; diagnostics add two writes.
- **Customer balance capacity is O(ledger) per priced admission under a per-account lock** (`niu-4rp.5`). The append-only ledger is summed on every reservation after `FOR NO KEY UPDATE`; admission latency grows with tenant history and concurrent admissions serialize.
- **Default-on request diagnostics** (`niu-4rp.10`). Up to 1 MiB of request body buffered, response tee up to 1 MiB, two database writes per request through semaphores of four.
- **No HTTP compression; 1.33 MB initial dashboard payload** (`niu-4rp.9`). Hashed assets cache for one hour rather than immutable.
- **Operator docs/defaults contradict runtime** (`niu-4rp.6`): pool default 32 vs documented 10; `NIU_ADMIN_TOKEN` vs `NIU_ADMIN_TOKENS`; README image `v0.2.5` vs `VERSION` 0.2.23; installer usage text `v0.2.19`. The architecture document also calls unified route publication unimplemented while startup and inference use it (`niu-4rp.16`).
- **Route surface duplication** (`niu-4rp.7`). 219 admin paths are hand-duplicated under `/api/v1`, with a third `organizations/projects` spelling; 170 body-limit layers repeat.
- **Dashboard bypasses the SDK package contract** (`niu-4rp.8`) through 52 six-level relative imports with no declared dependency.
- **Admin UI couples `platform_admin` to Owner-only `manage_operators`** (`niu-4rp.11`), locking out granted platform administrators and unrelated capabilities.
- **Domain rules concentrate in untyped PL/pgSQL** (`niu-4rp.12`): 330 triggers and 286 functions, 13 triggers on `attempts`, with Rust mapping errors by message.

## Medium

- Monolithic modules and unreadable diffs (`niu-4rp.15`).
- Ad-hoc dashboard data layer: 323 effects, 19 direct `fetch` files, duplicate request helpers, dead `useRead` (`niu-4rp.14`).
- Global CSS 290 KB with ~399 unreferenced selectors; duplicate `cn`; no ESLint (`niu-4rp.14`).
- Money formatting differs by page — 9 decimal places vs a page-local 4-decimal formatter (`niu-4rp.20`).
- Legacy naming and raw-UUID fallbacks reach product URLs (`niu-4rp.21`).
- Process-local metrics, no request correlation ID (`niu-4rp.17`).
- `/readyz` only runs `SELECT 1` (`niu-4rp.18`).
- Migrations apply in-process at startup with no migrate job (`niu-4rp.19`).
- Test-suite shape overstates coverage; suites are mostly in-process micro-benchmarks (`niu-4rp.1` notes).
- Retired components remain linked (`niu-4rp.28`).
- Latent request-path panics from `unwrap`/`expect` (`niu-4rp.22`).
- Development mock readiness performs an external HTTP call per gated request (`niu-4rp.23`).
- Unknown dashboard paths return 200 through the SPA fallback (`niu-4rp.24`).
- `.env.example` omits real deployment knobs; Compose and Render disagree on health endpoints (`niu-4rp.6` notes).

## Low / hardening

- Missing dashboard CSP/frame/nosniff headers (`niu-4rp.25`).
- Demo account falls back to `Hello123` (`niu-4rp.26`).
- Silent catch blocks hide recoverable failures (`niu-4rp.27`).
- No request ID on auth/readiness failures (`niu-4rp.17`).

## What is solid

Integer-only money arithmetic with checked overflow and one rounding step; reduced `u128` rationals for media; SSRF-resistant provider client pool with pinned DNS; append-only ledgers with immutable-entry triggers and independent customer/Supplier/cost ledgers; SHA-256 key hashes with constant-time comparison; `__Host-` HttpOnly cookies with Origin and `Sec-Fetch-Site` checks; Stripe signature/timestamp verification; image decoder allocation limits.

## Verification limits

- Backend database fixtures were not executed; no finding asserts a specific ledger computation is wrong.
- No browser session was inspected; UI findings are structural (permissions, formatting, dead CSS) rather than visual.
- No production telemetry was available; latency claims are round-trip counts from code.
- The working tree was mid-refactor; revalidate every finding against the current implementation before changing code, as required by the repository workflow.

## Finding → Bead map

| Area | Beads |
| --- | --- |
| Verification and dashboard failures | `niu-4rp.1`, `niu-4rp.3` |
| Payment prerequisite and onboarding | `niu-4rp.2` |
| Request-path performance | `niu-4rp.4`, `niu-4rp.5`, `niu-4rp.10`, `niu-4rp.9` |
| Operator contracts and docs | `niu-4rp.6`, `niu-4rp.16` |
| API and frontend boundaries | `niu-4rp.7`, `niu-4rp.8`, `niu-4rp.11` |
| Storage and domain logic | `niu-4rp.12`, `niu-4rp.19` |
| Observability and readiness | `niu-4rp.17`, `niu-4rp.18` |
| Maintainability and consistency | `niu-4rp.13`, `niu-4rp.14`, `niu-4rp.15`, `niu-4rp.20`, `niu-4rp.21`, `niu-4rp.28` |
| Robustness and hardening | `niu-4rp.22`, `niu-4rp.23`, `niu-4rp.24`, `niu-4rp.25`, `niu-4rp.26`, `niu-4rp.27` |

## Follow-up evidence — 2026-10-22

Revalidated all 28 children against `645f73188b767bd021eee145ebc1c22e0cab6016`
plus the preserved dirty working tree before product edits. Each bead records its
classification and current source evidence. Eight findings were confirmed,
18 partially confirmed, and two require product decisions (payment readiness and
the admin capability model). No finding was closed as stale. Historical counts
and performance hypotheses were not promoted to measured results.

The bounded implementation in `niu-4rp.3` validates the saved video task fields
consumed by VideoView before accepting the result, including task identity and
known state. Invalid data becomes a typed error handled through the existing
alert and **Reload status** action. A simultaneous diagnostics failure cannot
replace that task error. Seven added regression cases cover malformed responses
and successful reload without estimating, submitting or refreshing a generation.
Existing assertions were preserved.

| Command | Observed result |
| --- | --- |
| `pnpm --filter @niu-io/dashboard check` | Exit 0 before and after the change |
| `pnpm --filter @niu-io/dashboard test --maxWorkers=1 test/features/video/VideoView.test.tsx -t 'surfaces malformed'` | Exit 0; seven selected regression cases passed; 27 existing cases outside this selection |
| `pnpm --filter @niu-io/dashboard build` | Exit 0; bundle-size and ineffective dynamic-import warnings remain |
| `pnpm --filter @niu-io/dashboard test` | Failures observed in navigation, recovery, history, pricing and video billing; interrupted with exit 130 under resource pressure, without a final count |
| `pnpm --filter @niu-io/dashboard test --maxWorkers=1` | PlaygroundView: one failure of 67; AppLayout: three failures of 52; interrupted with exit 130 at the blocked delivery boundary, without a final suite count |
| `git diff --check -- apps/dashboard/src/features/video/VideoView.tsx apps/dashboard/test/features/video/VideoView.test.tsx` | Exit 0 |

The one-worker failures included draft-conflict settings recovery, customer
catalog reload on workspace switch, operator permission verification and revoked
operator session recovery. Their causes have not yet been dispositioned.

Rendered verification was blocked: two attempts to create an OpenRouter reference
browser timed out. A text fetch of the reference chat page succeeded but did not
expose its recovery interactions. Neither reference interaction inspection nor
the changed Niu route at desktop/narrow widths was verified. The
`ux-review` skill's [interaction and recovery criteria](https://www.nngroup.com/articles/ten-usability-heuristics/)
support a visible error with an appropriate recovery action; tests establish that
bounded functional behavior, not visual quality or browser acceptance.

This batch stopped at the earlier-blocked boundary requested for the follow-up.
The full dashboard suite remains unverified; no PostgreSQL behavioral suite,
CI regression experiment or live payment flow was executed. PR gating and
operator-documentation corrections were not started. Payment prerequisites,
admin permissions, credentials and money semantics were unchanged. No source
commit or remote publication was performed. Execution state and remaining
acceptance evidence remain in Beads.

At handoff, the user resolved the payment contract: funded or granted self-hosted
workspaces should work without merchant setup. Implementation and clean-install
verification remain pending. The admin capability model still needs a decision;
the user requested a plain-language explanation before selecting it.
