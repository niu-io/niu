# Current automated release checks

## Generations source/build refresh — 2026-10-09

The [isolated dashboard snapshot](dashboard-automated-verification.md#generations-and-filtering-snapshot--2026-10-09)
passed all 544 tests across 77 files and TypeScript checking. Production builds
for dashboard, docs and catalog then passed. The JavaScript license inventory
checked 608 installed package versions successfully. Public source, explicit
Docker build inputs and all three generated sites passed the boundary scanner
across 1,624 files; whitespace checks passed.

The dashboard build reports that Settings is both statically and dynamically
imported, so that route is not isolated into a separate lazy chunk. Build success
does not establish performance acceptance. These source/build checks do not
refresh the pinned container image, real payment/video qualification or full
F01–F10 acceptance.

## Release-script refresh — 2026-10-09

All 138 Python release-script tests passed after correcting a stale backup
promotion assertion. The restore implementation retains the source database
under a unique backup name; the test now requires that bounded identifier and
still checks the exact transaction that promotes the verified restore. The
initial failed run is not counted as a pass. This suite covers controlled
script fixtures and validators, not a new container install/restore run or
live payment/video qualification.

Verified 2026-10-08 against the current source tree; these checks do not qualify
a complete release, a live Supplier, browser workflows or the current packaged image.
The [machine-readable record](evidence/release-automated-2026-10-08.json) captures scope.

| Check | Result | Limitation |
| --- | --- | --- |
| Dashboard snapshot/tests/types | 525 tests across 74 files passed | Isolated source snapshot; complete rendered/live acceptance remains open. |
| Rust workspace tests | 301 passed, 279 ignored, zero failed | Ignored PostgreSQL/live cases were not executed and are not qualified. |
| Rust formatting | Passed | `cargo fmt --all --check`; no broad reformatting was applied. |
| Rust Clippy | Passed | Locked workspace/all-targets check with warnings denied. |
| JavaScript SDK | 168 passed, zero skipped/failed | Fresh SDK build; controlled API tests, not live channel qualification. |
| Public boundary/build inputs | Passed, 1,278 files | Pattern and build-input checks do not constitute a complete security audit. |

The 399 captured Rust source, manifest, SQL and fixture inputs stayed unchanged
through workspace tests and Clippy. The development server and saved credentials
were not used or replaced by these checks. Rust checks used the documented native
build toolchain. Existing packaged-image evidence covers its pinned build only;
these source checks do not refresh that image.

Dashboard source passed separately with the
[isolated snapshot runner](dashboard-automated-verification.md). Full-run timeouts
remain failed checks; focused passes do not substitute for a complete run.
Three Chat workflow fixtures now paste setup prompts instead of simulating every
keystroke. Their persistence, per-model failure and workspace-abort assertions
and deadlines are unchanged. All 37 focused Chat tests and both Supplier directory
tests passed. No capability or release gate is marked complete from these results.

The current migration-0187 source refresh passed workspace tests, formatting,
all-target Clippy with warnings denied and the SDK build/tests. All 399 captured
Rust inputs remained unchanged. The 279 ignored cases remain unqualified by
this standard run; explicit disposable PostgreSQL acceptance is separate.

### Explicit gateway PostgreSQL refresh

The disposable database runner passed all 123 gateway PostgreSQL tests, including
five process-replacement tests. This is separate from the standard workspace
run, whose 279 ignored cases were not executed there. Two stale test expectations
were corrected to reflect the documented removal of external execution imports:
retired routes return 404, gateway Activity preserves request task correlation
and exposes no imported task evidence (the compatibility field remains null).
Customer procurement routes still return 403. Chronological pagination, request
detail and timing aggregate assertions remain in place. The final full database
run passed after those corrections; earlier failed runs are not counted as passes.

This does not qualify storage integration cases, live Suppliers, rendered UX or
full F01–F10 acceptance. The package checkpoint continues to identify its frozen
source, which predates these test-only corrections.

### Explicit storage PostgreSQL refresh

The complete disposable PostgreSQL storage run passed 155 tests across
29 targets, with zero failures or ignored tests in this explicit run.
All 260 captured storage inputs remained unchanged. Coverage includes
authorization and tenant isolation, customer balances/reservations and top-ups,
immutable media pricing and settlement, Supplier credential/model subsets,
asset qualification/read/update recovery, payload retention and request
diagnostics. Historical external-observation storage tests preserve existing
data contracts; their passing does not re-enable collection or expand Niu scope.

Together with the separately recorded gateway PostgreSQL run, this refresh
executes the database acceptance cases skipped by the standard workspace run.
Live transport/entitlement and rendered workflows remain separate, unqualified
release requirements.

The remaining ignored workspace case is
`crates/media/tests/live_result_tls.rs`, which requires public HTTPS access to
the external WPT media fixture. It is not covered by either PostgreSQL run and
is not counted as passed. Prior restricted-network probe failures do not
justify relaxing egress or TLS checks; external transport acceptance stays open.
