# Inference hot-path readiness, registry and credential cost

Date: 2026-11-06. Bead: `niu-4rp.4`. Scope: per-request work performed before
an authenticated inference request reaches dispatch. Public tree revision
`a57b1dc5` plus the uncommitted working tree used for this measurement; no
commit, push or Beads state change is part of this record.

## Environment

| Item | Value |
| --- | --- |
| Host | Apple M4, 10 logical CPUs, 25,769,803,776 bytes RAM |
| OS | macOS 27.2 (arm64) |
| Toolchain | rustc 1.98.0, cargo 1.98.0, PostgreSQL 17.11 (Homebrew) |
| Build | `cargo test -p niu-gateway --release --no-run` |
| Load generator | in-process `reqwest` keep-alive client, one HTTP connection, full-body timing |
| Samples | 50 warm-up requests, then 800 measured requests, sequential, nearest-rank percentiles |

The workstation runs other workspaces and builds concurrently. The before and
after builds were both produced on this host with the same compiler and database
settings, but the host load was not held constant. Latency percentiles are
descriptive for this host; the server-side statement counts are exact and do not
depend on client or host scheduling.

## Benchmark command and dataset

```sh
python3 scripts/hot-path-benchmark.py --samples 800
```

The runner creates a disposable PostgreSQL 17 cluster with `log_statement=all`,
builds (or accepts `--binary` for) the ignored gateway test
`web::tests::hot_path_benchmark::hot_path_readiness_registry_credential`, and
runs it via the real Axum router and a loopback OpenAI-compatible mock upstream.
The fixture is one organization, one/default workspace, one active API key, one
owner-funded managed vendor route with an encrypted credential, USD platform
currency, and synthetic Stripe account/callback evidence that makes the readiness
gate take its ready fast path. Request diagnostics use the default-on capture
mode. No paid provider call, external network dependency or production data is
involved.

The test writes `SELECT 'NIU_HOT_PATH_START'` / `..._END'` markers around the
measured loop, waits for batched admission writes and diagnostic/timing tasks,
and then stops. The runner counts PostgreSQL log lines between the markers and
reports statements per request. `--binary` runs a frozen ignored-test executable
directly, which avoids rebuilding while the shared working tree changes.

Executables:

- before: `target/release/deps/niu_gateway-bdff450d649f1e81`,
  SHA-256 `30a678fddd67ed7b9217dab1d82dac1e5c070a633e6049c56716f43ef0f80598`
- after: `target/release/deps/niu_gateway-bdff450d649f1e81`,
  SHA-256 `e1b7ffba7c5b480ff43d0754704b9d5bde45621ef41927ab24f1667d40751d58`

## Before

Three consecutive 800-request runs of the frozen before executable:

| Run | P50 ms | P95 ms | P99 ms | Requests/s | Statements/request |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 5.558 | 9.181 | 16.651 | 163.24 | 35.062 |
| 2 | 6.642 | 16.228 | 26.282 | 123.79 | 35.076 |
| 3 | 7.013 | 14.072 | 30.495 | 123.27 | 35.080 |
| Median | 6.642 | 14.072 | 26.282 | 123.79 | 35.076 |

Statement categories per request (run 2): 14.076 `SELECT`, 2.001 CTE
(`WITH`), 5 `INSERT`, 5 `BEGIN`, 5 `COMMIT`, 3 `set_config`, 1 `UPDATE`.

Per-request ready-path round trips derived from the code and corroborated by the
log: `platform_currency` is cached after the first positive read; one
`payment_gateway_configuration` read; one Stripe account-evidence read; one
Stripe callback-evidence read; one key authentication read; at most one route
generation read per 100 ms process window; one `shared_vendor_route` read plus
local credential decryption. That is five authoritative round trips per request
before dispatch, of which three belong to readiness.

## Changes

1. **One readiness statement.** `Store::payment_readiness_facts` returns the
   platform currency, EPay configuration row, latest configuration-bound account
   evidence and verified callback digests in one statement. `payments::readiness`
   derives the current digests from the live runtime and matches them against
   that result. A readiness read is now one round trip instead of three, and no
   process cache can retain a revoked or expired gateway.
2. **Materialized verified callback digests.** Migration
   `0425_payment_verified_callback_digests.sql` adds a small
   `(gateway, configuration_digest)` table, backfills existing evidence, and the
   callback, signed-notification and settlement paths update it in the same
   transaction as the evidence. The readiness query no longer scans every
   settled top-up on every request while still requiring a configuration-bound
   callback plus settlement.
3. **No transaction setup for single-statement key-policy reads.**
   `check_key_ip`, `key_ip_policy` and `key_ip_history` use their single
   statement snapshot directly instead of `BEGIN` + `set_config` + `SELECT` +
   `COMMIT`. `authenticate_with_ip` was already a single statement; no
   REPEATABLE READ transaction remains on credential authentication.
4. **Bounded transactions start in one message.** Both
   `begin_bounded_read_snapshot` (repeatable-read, read-only) and
   `begin_bounded_recording` (recording) now send `BEGIN` and both `SET LOCAL`
   limits in one simple-query message. Snapshot reads that need cross-statement
   consistency keep repeatable read and the 250 ms/2 s bounds, but setup costs
   one round trip instead of two.
5. **Currency cache decision.** `platform_currency` remains a positive-only
   in-process cache. The database rejects updates and deletes of the singleton
   row, so a cached positive currency cannot become wrong; a negative result is
   not cached, so a later configuration is observed on the next request. A
   readiness cache was deliberately not added: a revision probe costs the same
   one round trip as the authoritative combined query, and account evidence
   expires on the database clock with no monotonic revision. Caching readiness
   would risk a stale positive state after expiry, contrary to the bead's
   direction check.

## After

Three consecutive 800-request runs of the frozen after executable:

| Run | P50 ms | P95 ms | P99 ms | Requests/s | Statements/request |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2.644 | 4.959 | 6.166 | 343.75 | 30.031 |
| 2 | 3.229 | 8.552 | 11.267 | 257.46 | 30.041 |
| 3 | 3.410 | 6.917 | 9.427 | 256.79 | 30.043 |
| Median | 3.229 | 6.917 | 9.427 | 257.46 | 30.041 |

Statement categories per request: 12.038 `SELECT`, 2.001 CTE (`WITH`), 5
`INSERT`, 5 `BEGIN`, 5 `COMMIT`, 1 `UPDATE`, and no `set_config`.

Measured change: 5.035 fewer statements per request (35.076 to 30.041), including
2.04 fewer `SELECT`/`WITH` reads and three fewer `set_config` calls. All three
per-request `set_config` round trips disappeared because bounded read and
recording transactions now carry their limits in the single `BEGIN` message. After the change a direct-alias request performs three
authoritative pre-dispatch round trips: readiness facts, key authentication and
the route/credential read; route generation is normally served by the existing
100 ms process cache.

## Remaining per-request budget

| Item | Round trips | Notes |
| --- | ---: | --- |
| Installation readiness facts | 1 | currency, EPay configuration and configuration-bound evidence in one statement |
| API key authentication | 1 | indexed `token_hash` lookup with revocation and expiry predicates; no transaction |
| Route generation | ~0.03 | in-process 100 ms check window; at most about 10 reads/second/process |
| Published route plus credential | 1 | `shared_vendor_route` rechecks enabled flags, ownership, supply availability and cooldown; credential decryption stays local |
| Workspace-pool eligibility | +3 | bounded repeatable-read snapshot (`BEGIN`+`SET LOCAL`, `SELECT`, `COMMIT`); direct aliases do not pay this |
| Durable admission, diagnostics and accounting | measured residual | admission intent, payload/timing evidence and settlement writes are intentionally not cached and dominate the remaining statement count |

The gate's funded-without-merchant path additionally authenticates the request
to resolve its company and reads one funding-arrangement query; the adapter
path reuses the handler's principal. Neither is cached because funding and key
revocation must be observed immediately.

## Verification

- `cargo check -p niu-storage -p niu-gateway` passes.
- Full non-ignored gateway unit suite: 175 passed, 0 failed, 183 ignored
  (run from the release test executable).
- `cargo test -p niu-storage --lib`: 41 passed, 0 failed, 5 ignored.
- `settled_funding_is_exact_idempotent_and_cannot_cross_accounts` passes after
  the recording transaction setup change.
- PostgreSQL-backed tests:
  `payment_readiness_gates_and_recovers_without_mutating_customer_data`,
  `payment_callback_verification_requires_original_configuration_and_settlement`,
  `native_notification_qualification_requires_both_receipt_and_settlement`,
  `bounded_read_snapshot_applies_isolation_and_limits_in_one_setup`,
  `single_statement_key_policy_reads_are_not_transactional`, and
  `currency_is_durable_once_and_does_not_relabel_history` pass.
- `python3 scripts/check-openapi-entrypoints.py` passes (343 paths, 423 methods).
- `python3 scripts/check-public-boundary.py` passes for the changed files.
- `python3 scripts/check-migration-history.py` reports the released migration
  history is unchanged; `0425` is a new migration.
- `rustfmt --edition 2024 --check` passes for the changed files.

The readiness test now covers immediate revocation by a newer failed check,
expiry after a one-second evidence interval, and recovery with fresh evidence.
The callback tests assert the materialized digest view, including the ZhifuX
settlement-after-receipt order. The currency test asserts that a store which saw
the unconfigured state observes a later configuration, while the immutable row
rejects a conflicting currency.

## Remaining risk

- The working tree is shared with concurrent unrelated work. Between the before
  and after builds, files for invitations and media-source routes changed; none
  of those modules is on the measured request path, and the measured statement
  delta equals the intended change, but these binaries are not from a pristine
  isolated checkout. The executable hashes identify each measured artifact.
- Percentiles are from a shared, concurrently loaded workstation. The statement
  counts are the controlled comparison; latency medians should not be read as a
  capacity claim or a production SLO.
- The residual admission/diagnostic/accounting write cost is larger than the
  pre-dispatch read cost. Sequential benchmarking overstates it because
  production concurrent inference batches admissions; this bead does not change
  those writes.
- Workspace-pool candidate selection still pays three round trips for bounded
  eligibility. Removing them would drop the statement timeout that currently
  prevents a blocked catalog read from occupying a connection.
- Credential decryption remains per request by design: the route read is the
  revocation boundary, and caching decrypted material would add a secret-bearing
  cache without removing a round trip.
- `payment_verification_evidence` grows with periodic checks. The materialized
  digest table keeps readiness O(1), but evidence retention remains a separate
  operational concern.
- The readiness-gate test expected key listing to be blocked while payment
  setup is incomplete. Current policy treats key listing as credential
  maintenance and keeps it available; the test expectation was corrected to
  match that documented behavior rather than changing the gate.
