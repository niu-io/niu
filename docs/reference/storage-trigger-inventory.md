# Storage Trigger Inventory and Admission Invariants

This document inventories the PostgreSQL triggers on `attempts` and the customer balance ledger (`customer_balance_accounts`, `customer_balance_entries`, `customer_balance_reservations`), their table-driven error mappings in `crates/storage`, and the per-request database round-trip budget on the inference hot path.

## 1. `attempts` Trigger Inventory and Named Tests

After migration `0333_consolidate_attempt_guardrail_dispatch_triggers.sql` and `0365_public_run_references.sql`, the `attempts` table has 14 active triggers enforcing dispatch, rate-limit, guardrail, supplier qualification, media liability, and public-reference invariants:

| Trigger Name | Migration | Timing & Event | Function | SQLSTATE / Constraint | Named Verification Test |
| --- | --- | --- | --- | --- | --- |
| `attempts_require_current_supplier_qualification` | `0029`, `0333` | `BEFORE UPDATE OF execution` | `niu_guard_qualified_supplier_dispatch()` | `23514` | `crates/storage/tests/supplier_qualification.rs::attempts_trigger_requires_current_supplier_qualification` |
| `dispatch_requires_current_model_guardrails` | `0051`, `0333` | `BEFORE UPDATE OF execution` | `niu_check_dispatch_model_guardrails()` | `P0010` | `crates/storage/tests/guardrails.rs::dispatch_requires_current_model_guardrails_trigger` |
| `immutable_dispatch_provider` | `0053` | `BEFORE UPDATE OF dispatch_provider` | `reject_dispatch_provider_change()` | `23514` | `crates/storage/tests/postgres.rs::dispatch_provider_is_immutable_once_recorded` |
| `zy_check_inspected_guardrail_binding` | `0059`, `0333` | `BEFORE UPDATE OF execution` | `niu_check_inspected_guardrail_binding()` | `P0010` | `crates/storage/tests/guardrails.rs::inspected_guardrail_binding_and_detector_coverage_trigger` |
| `require_customer_balance_dispatch` | `0086`, `0103`, `0121` | `BEFORE INSERT OR UPDATE OF execution` | `require_customer_balance_dispatch()` | `P0006` / `P0008` / `23514` | `crates/storage/tests/billing.rs::prepaid_dispatch_requires_active_balance_reservation` |
| `require_media_completion_evidence` | `0118` | `BEFORE UPDATE OF execution` | `require_media_completion_evidence()` | `23514` | `crates/storage/tests/media_jobs.rs::media_completion_requires_durable_result_or_failure_evidence` |
| `media_offer_requires_media_dispatch` | `0130`, `0333` | `BEFORE UPDATE OF execution` | `niu_guard_media_offer_dispatch()` | `23514` | `crates/storage/tests/supplier_media_offers.rs::media_offer_requires_qualified_media_dispatch` |
| `require_media_output_before_dispatch` | `0134`, `0333` | `BEFORE UPDATE OF dispatched_at` | `require_media_output_before_dispatch()` | `23514` | `crates/storage/tests/media_pricing.rs::media_dispatch_requires_pinned_output_or_bound` |
| `require_media_recovery_protocol` | `0203` | `BEFORE UPDATE` | `require_media_recovery_protocol()` | `23514` | `crates/storage/tests/media_jobs.rs::media_recovery_requires_bound_protocol` |
| `enforce_key_request_rate` | `0207` | `AFTER INSERT OR UPDATE OF dispatched_at` | `enforce_key_request_rate()` | `P0020` / `P0026` | `crates/storage/tests/key_request_rate.rs::key_request_rate_limit_blocks_excess_dispatch` |
| `enforce_key_concurrency` | `0208` | `AFTER INSERT OR UPDATE OF dispatched_at` | `enforce_key_concurrency()` | `P0021` | `crates/storage/tests/key_concurrency.rs::key_concurrency_limit_blocks_excess_in_flight_attempts` |
| `enforce_key_token_rate` | `0210` | `AFTER INSERT OR UPDATE OF dispatched_at` | `enforce_key_token_rate()` | `P0022` / `P0023` | `crates/storage/tests/key_token_rate.rs::key_token_rate_limit_enforces_rolling_window_and_bound` |
| `recheck_managed_attempt_route` | `0212` | `BEFORE INSERT OR UPDATE OF execution` | `recheck_managed_attempt_route()` | `P0024` | `crates/storage/tests/vendors.rs::managed_attempt_route_rechecks_current_vendor_and_model_state` |
| `require_gateway_retry_deadline` | `0226` | `BEFORE UPDATE` | `require_gateway_retry_deadline()` | `P0028` | `crates/storage/tests/gateway_retry.rs::gateway_retry_enforces_request_deadline` |
| `enforce_vendor_request_rate` | `0232` | `AFTER INSERT OR UPDATE OF dispatched_at` | `enforce_vendor_request_rate()` | `P0025` / `P0027` | `crates/storage/tests/vendor_request_rate.rs::vendor_request_rate_limit_enforces_window` |
| `require_current_ingested_video_deadline` | `0284`, `0333` | `BEFORE UPDATE OF dispatched_at` | `require_current_ingested_video_deadline()` | `23514` | `crates/storage/tests/video_intents.rs::ingested_video_binding_requires_unexpired_deadline_at_dispatch` |
| `guard_platform_media_liability_dispatch` | `0315`, `0333` | `BEFORE UPDATE OF execution` | `guard_platform_media_liability_dispatch()` | `23514` | `crates/storage/tests/retail_media_admission.rs::platform_media_dispatch_requires_active_liability_qualification` |
| `preserve_attempt_public_reference` | `0365` | `BEFORE UPDATE OF public_reference` | `preserve_attempt_public_reference()` | `23514` | `crates/storage/tests/postgres.rs::public_run_reference_is_immutable` |

## 2. Table-Driven Trigger Error Mapping (`crates/storage/src/accounting.rs`)

Database trigger rejections are mapped to typed `StoreError` variants via static lookup tables in `crates/storage/src/accounting.rs` (`TRIGGER_CODE_MAPPINGS` and `TRIGGER_CONSTRAINT_MAPPINGS`) rather than substring matching on human-readable error messages:

- **`TRIGGER_CODE_MAPPINGS`** maps SQLSTATE codes (`P0005` through `P0039`) to `StoreError` variants (`Unauthorized`, `Conflict`, `AccountUnavailable`, `BudgetExceeded`, `InvalidPrice`, `KeyRequestRateExceeded`, `KeyConcurrencyExceeded`, `KeyTokenRateExceeded`, `KeyTokenBoundRequired`, `ManagedRouteChanged`, `VendorRequestRateExceeded`, `KeyRequestRateDisabled`, `VendorRequestRateDisabled`, `GatewayRequestDeadlineExceeded`, `ProcurementUnavailable`).
- **`TRIGGER_CONSTRAINT_MAPPINGS`** maps explicit PostgreSQL `CONSTRAINT` identifiers (`customer_workspace_spending_limit_exceeded` -> `StoreError::WorkspaceSpendingLimitExceeded`, `customer_key_spending_limit_exceeded` -> `StoreError::KeySpendingLimitExceeded`) set in migration `0373_customer_balance_account_posted_sum.sql`.

## 3. O(1) Customer Balance Capacity Projection (`niu-4rp.5`)

Migration `0373_customer_balance_account_posted_sum.sql` adds `posted_balance_nanos NUMERIC NOT NULL DEFAULT 0` to `customer_balance_accounts`:

- Maintained in the same transaction by `a00_maintain_customer_account_posted_balance_on_entry` (`AFTER INSERT ON customer_balance_entries`).
- Guarded against direct tampering by `guard_customer_account_posted_balance` (`BEFORE INSERT OR UPDATE OF posted_balance_nanos ON customer_balance_accounts`, constraint `customer_account_posted_balance_guard`).
- Reconciled against the append-only ledger via `niu_verify_customer_account_posted_balance(account_id)`.
- Verified in `crates/storage/tests/billing.rs::posted_balance_counter_is_o1_on_100k_entries_and_prevents_concurrent_double_spend` on a 100,000-entry synthetic account with `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` (0 scans on `customer_balance_entries`) and 8-way concurrent reservation contention (exact capacity enforcement with zero double-spend or drift).

## 4. Inference Hot-Path Database Round-Trip Budget (`niu-4rp.4`)

Before `niu-4rp.4`:
- `Store::authenticate_with_ip` wrapped a single indexed `SELECT` in `begin_bounded_read_snapshot()` (`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT set_config(...)` + `SELECT` + `COMMIT` = 3–4 DB round-trips).
- `Store::platform_currency()` queried `SELECT currency FROM platform_currency WHERE singleton` on every request in the payment readiness middleware.
- `payments::readiness::gate` re-executed `inspect(&state)` inside `inspect_organization(&state, org)` when falling back to company funding.

After `niu-4rp.4`:
- Single-statement key authentication (`authenticate`, `authenticate_with_ip`, `dashboard_key`, `dashboard_key_with_ip`, `dashboard_key_by_id_with_ip` in `crates/storage/src/keys.rs`) executes directly against `self.pool` under PostgreSQL's single-statement MVCC snapshot (**1 DB round-trip** instead of 4 statements).
- `Store::platform_currency()` caches the write-once singleton currency in `Store::platform_currency_cache` (`OnceLock<String>`) once configured (**0 DB round-trips** after first read/write).
- `payments::readiness::gate` reuses `base_readiness` and only checks `organization_has_funding` when installation-level merchant checkout is not ready.
- Remaining per-request DB round-trip budget before upstream dispatch:
  1. Key authentication (`authenticate_with_ip`): **1 round-trip**.
  2. Payment/funding readiness check: **1 round-trip** (cached platform currency + indexed funding/verification lookup).
  3. Atomic admission & balance reservation (`admit_priced_gateway_request` / `reserve_customer_balance` with O(1) `posted_balance_nanos`): **1 transaction**.
