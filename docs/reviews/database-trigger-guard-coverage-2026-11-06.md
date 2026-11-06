# Database trigger guard coverage — 2026-11-06

Status: **bounded slice complete; not full acceptance**. Bead `niu-4rp.12` remains
open. This record is the verification companion to
[`docs/architecture/database-trigger-inventory.md`](../architecture/database-trigger-inventory.md).

## Scope and source

- Worktree: `/Users/ticos/Niu/niu-handoff-v0.3-20261104` (v0.3 handoff).
- Effective schema: all embedded migrations `0001` through `0429` applied in
  order to a disposable PostgreSQL 17 database.
- Inventory: **412 triggers, 218 public functions, 331 tables** after the one
  guard moved out of the schema (below). The squashed baseline itself contains
  370 `CREATE TRIGGER` and 368 function definitions; later migrations replace
  and add definitions, so the runtime catalog is the authoritative count.
- `attempts` has **19 triggers** after migration 0429 (20 before the move).

## Coverage

**17/412 triggers** have a table-qualified named test
(`trigger_<table>_<trigger>` in `crates/storage/tests/trigger_guards.rs`).
This is deliberately strict: a behavioral test that never names the trigger
does not count, and a test for one `platform_currency_guard` instance does not
count for the other tables that use the same trigger name.

| Attempt trigger | Test |
| --- | --- |
| `dispatch_requires_current_model_guardrails` | `trigger_attempts_dispatch_requires_current_model_guardrails_rejects_denied_model` |
| `enforce_key_concurrency` | `trigger_attempts_enforce_key_concurrency_blocks_second_unresolved_dispatch` |
| `enforce_key_request_rate` | `trigger_attempts_enforce_key_request_rate_blocks_disabled_and_exhausted` |
| `enforce_key_token_rate` | `trigger_attempts_enforce_key_token_rate_requires_bound_and_rejects_exhaustion` |
| `enforce_vendor_request_rate` | `trigger_attempts_enforce_vendor_request_rate_rejects_disabled_credential` |
| `immutable_dispatch_provider_snapshot` | `trigger_attempts_immutable_dispatch_provider_snapshot_rejects_change_after_dispatch` |
| `preserve_attempt_public_reference` | `trigger_attempts_preserve_attempt_public_reference_rejects_rename` |
| `recheck_managed_attempt_route` | `trigger_attempts_recheck_managed_attempt_route_rejects_stale_vendor_revision` |
| `require_current_media_dispatch_route` | `trigger_attempts_require_current_media_dispatch_route_rejects_stale_route` |
| `require_customer_balance_dispatch` | `trigger_attempts_require_customer_balance_dispatch_rejects_unfunded_currency_dispatch` |
| `require_media_completion_evidence` | `trigger_attempts_require_media_completion_evidence_rejects_unresolved_job` |
| `require_media_output_before_dispatch` | `trigger_attempts_require_media_output_before_dispatch_rejects_missing_snapshot` |
| `require_media_recovery_protocol` | `trigger_attempts_require_media_recovery_protocol_rejects_dispatch_without_protocol` |
| `zy_check_inspected_guardrail_binding` | `trigger_attempts_zy_check_inspected_guardrail_binding_requires_input_binding` |

Route/billing guards with named tests:

- `managed_attempt_routes.protect_managed_attempt_route`
- `model_route_pools.protect_model_route_pool`
- `customer_balance_accounts.platform_currency_guard` (one instance only)

Error-mapping coverage is verified by
`trigger_error_tables_cover_effective_schema`: every custom `P0000`-style
SQLSTATE and every named trigger `CONSTRAINT` in the effective schema is present
in `crates/storage/src/trigger_error.rs`. The table has **19 codes** (including
`P0005`, `P0028` and `P0039`, which no current trigger function raises directly)
and **12 constraints**. `P0001` is the PL/pgSQL default and is intentionally not
mapped.

## Attempt triggers not covered

| Trigger | Why it is not in this slice |
| --- | --- |
| `attempts_require_current_supplier_qualification` | Needs a qualified Provider offer and a `provider_attempt_offers` fixture. The insert guard rejects an unqualified binding before dispatch, so building the invalid state requires the full Provider qualification/authorization fixture; no product API creates it cheaply. |
| `connection_incident_execution_recovery` | `AFTER UPDATE` side-effect, no `RAISE`. It needs a connection-incident lifecycle fixture and is not a guard. |
| `guard_platform_media_liability_dispatch` | Needs `retail_media_attempt_prices` plus matching media liability, offer, recovery route, customer pricing and liability-bound rows. |
| `media_offer_requires_media_dispatch` | Needs a `provider_offer_revisions` row with `rate_kind='media'`, supplier media pricing, a media route and matching customer pricing/liability. |
| `require_current_ingested_video_deadline` | Needs an `ingested_video_request_bindings` row, which requires ingestion consent/readiness rows and a prepared-video trigger; the fixture cost is disproportionate for this slice. |

One original attempts guard was **moved to Rust** instead of tested in SQL:
`require_gateway_retry_deadline`. Migration
`0429_gateway_retry_deadline_rust_owned.sql` drops the trigger and function;
`Store::mark_dispatched` now checks the same static
`gateway_retry_policies.deadline` after taking the attempt row lock and returns
`StoreError::GatewayRequestDeadlineExceeded`. Test:
`trigger_attempts_require_gateway_retry_deadline_is_rust_owned`. The other 5
untested attempt triggers remain schema-owned.

## Error mapping change

`crates/storage/src/trigger_error.rs` is now the single table for trigger-raised
SQLSTATE and constraint names. Ad-hoc `code() == ...` checks in
`accounting.rs`, `vendors.rs`, `providers.rs` and
`customer_balance_grants.rs` were replaced with the central classifier; the
gateway's three constraint special cases were replaced by
`trigger_error::classify`. Context-specific overrides remain where a write
method intentionally collapses `P0008` to `Conflict`
(`vendors::map_vendor_write_error`,
`providers::map_qualification_write_error`) and where `23505` uniquely means a
slug/target collision. No trigger message text is matched.

`StoreError::PlatformCurrencyMismatch` was added so the
`platform_currency_guard` constraint keeps the existing HTTP 400 message
("Use the configured platform currency…") after leaving the gateway's ad-hoc
match.

## Verification run

| Command | Result |
| --- | --- |
| `python3 scripts/db_schema_inventory.py` | applied all 429 migrations on disposable PostgreSQL; wrote the inventory and attempt JSON |
| `cargo check -p niu-storage` | pass |
| `cargo check -p niu-gateway` | pass (one pre-existing `ADAPTER_VERSION` unused-import warning) |
| `cargo test -p niu-storage --lib` | 61 passed, 0 failed, 5 ignored |
| `cargo test -p niu-storage --test trigger_guards -- --ignored --test-threads=1` | 19 passed, 0 failed |
| `cargo test -p niu-gateway --bin niu-gateway` | 234 passed, 0 failed, 194 ignored |
| `cargo test -p niu-gateway --no-run` | pass |
| `python3 scripts/check-migration-history.py <previous> crates/storage/migrations` | `Released migration history is unchanged.` |
| `cargo test -p niu-storage --test migration_compatibility -- --ignored` | 1 passed, 1 failed: `original_174_receipt_upgrades_without_rewriting_history` fails at `create_organization` because the current Rust insert includes `organizations.slug`, which the preserved original-174 schema does not have. This failure is outside this change and not repaired here. |

## Remaining work

1. Cover the 5 untested attempts guards with Provider/media fixtures, or
   explicitly disposition them if their fixture cost is not justified.
2. Add named tests for the remaining route/billing/supply guards; 17/412 is a
   prioritized slice, not full schema coverage.
3. Extend the trigger inventory to flag guards whose function is shared by
   several trigger instances and whose tests are per-instance.
4. Revalidate the 174 compatibility test against the current `organizations`
   schema before changing migration-compatibility acceptance.
5. Decide whether more simple static guards should move into Rust; only the
   retry deadline was moved in this slice, and the race window changed from
   UPDATE-time to pre-UPDATE check time.
