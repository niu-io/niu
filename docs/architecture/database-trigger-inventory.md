# Database trigger and function inventory

Generated from the effective schema after applying every embedded migration (0001 through the latest) on 2026-11-06T02:59:06Z. Do not edit by hand; regenerate with:

```sh
python3 scripts/db_schema_inventory.py
```

**412 triggers, 218 public functions and 331 tables.** 19 triggers fire on `attempts`; 17 triggers have a table-qualified named test.

## How to read this inventory

- **Invariant** is derived from the RAISE messages in the trigger function. A trigger with no RAISE is a side-effect trigger (audit, denormalization or recovery), not a guard. This derivation is evidence, not a proof: read the function body before changing it.
- **Attempt path** is a heuristic classification: `direct attempt` fires on `attempts`; `attempt-adjacent` names an `attempt_id` or an attempt table; `billing`, `route/supply` and `none` group the rest by table/trigger name. It identifies the rules an attempt transaction can reach; it does not prove every path is reachable.
- **Named test** lists test functions whose name contains `trigger_<table>_<trigger>`. It is deliberately strict: a behavioral test that never names the trigger does not count. See the coverage boundary at the end for untested guards.
- **Source migration** is the last migration file that contains a CREATE/REPLACE statement for the name. Dynamic SQL can move that evidence; the runtime definition is the catalog text in this document.

## Attempt-path triggers

These are the rules that can reject an attempt transaction. This is the prioritized review surface for `crates/storage` and `apps/gateway`.

| Trigger | Timing / event | Function | Invariant (derived) | Named test |
| --- | --- | --- | --- | --- |
| `attempts_require_current_supplier_qualification` | BEFORE UPDATE | `niu_guard_qualified_supplier_dispatch` | supplier offer authorization changed before dispatch | untested |
| `connection_incident_execution_recovery` | AFTER UPDATE | `niu_resolve_connection_incidents_on_evidence` | side-effect; no RAISE | untested |
| `dispatch_requires_current_model_guardrails` | BEFORE UPDATE | `niu_check_dispatch_model_guardrails` | access guardrail changed before dispatch | `trigger_attempts_dispatch_requires_current_model_guardrails_rejects_denied_model` |
| `enforce_key_concurrency` | AFTER INSERT OR UPDATE | `niu_enforce_key_concurrency` | API key concurrent request limit reached | `trigger_attempts_enforce_key_concurrency_blocks_second_unresolved_dispatch` |
| `enforce_key_request_rate` | AFTER INSERT OR UPDATE | `niu_enforce_key_request_rate` | API key request rate is disabled; API key request rate exhausted | `trigger_attempts_enforce_key_request_rate_blocks_disabled_and_exhausted` |
| `enforce_key_token_rate` | AFTER INSERT OR UPDATE | `niu_enforce_key_token_rate` | API key token rate exhausted; Token budget requires supported bounded text input; Existing unknown usage has no token budget | `trigger_attempts_enforce_key_token_rate_requires_bound_and_rejects_exhaustion` |
| `enforce_vendor_request_rate` | AFTER INSERT OR UPDATE | `niu_enforce_vendor_request_rate` | Conflicting credential bindings; Credential rate policy missing; Upstream credential request rate is disabled; Upstream credential request rate exhausted | `trigger_attempts_enforce_vendor_request_rate_rejects_disabled_credential` |
| `guard_platform_media_liability_dispatch` | BEFORE UPDATE | `guard_platform_media_liability_dispatch` | Platform media liability qualification changed before dispatch | untested |
| `immutable_dispatch_provider_snapshot` | BEFORE UPDATE | `niu_guard_dispatch_provider_snapshot` | dispatch Provider snapshot is immutable | `trigger_attempts_immutable_dispatch_provider_snapshot_rejects_change_after_dispatch` |
| `media_offer_requires_media_dispatch` | BEFORE UPDATE | `niu_guard_media_offer_dispatch` | media offer requires pinned media pricing, liability and route | untested |
| `preserve_attempt_public_reference` | BEFORE UPDATE | `preserve_attempt_public_reference` | public run references are permanent | `trigger_attempts_preserve_attempt_public_reference_rejects_rename` |
| `recheck_managed_attempt_route` | BEFORE INSERT OR UPDATE | `recheck_managed_attempt_route` | route pool changed before dispatch; managed route changed before dispatch | `trigger_attempts_recheck_managed_attempt_route_rejects_stale_vendor_revision` |
| `require_current_ingested_video_deadline` | BEFORE UPDATE | `require_current_ingested_video_deadline` | ingested image dispatch deadline elapsed | untested |
| `require_current_media_dispatch_route` | BEFORE INSERT OR UPDATE | `require_current_media_dispatch_route` | media dispatch route changed | `trigger_attempts_require_current_media_dispatch_route_rejects_stale_route` |
| `require_customer_balance_dispatch` | BEFORE INSERT OR UPDATE | `require_customer_balance_dispatch` | personal dispatch ownership, policy or route changed; personal dispatch has incompatible accounting; Credits dispatch requires its pinned unit price and fully funded ranges; Currency dispatch cannot reuse Credits accounting; prepaid dispatch requires a funded retail reservation | `trigger_attempts_require_customer_balance_dispatch_rejects_unfunded_currency_dispatch` |
| `require_media_completion_evidence` | BEFORE UPDATE | `require_media_completion_evidence` | media completion unresolved | `trigger_attempts_require_media_completion_evidence_rejects_unresolved_job` |
| `require_media_output_before_dispatch` | BEFORE UPDATE | `require_media_output_before_dispatch` | media dispatch requires effective output snapshot | `trigger_attempts_require_media_output_before_dispatch_rejects_missing_snapshot` |
| `require_media_recovery_protocol` | BEFORE UPDATE | `require_media_recovery_protocol` | video dispatch requires original recovery protocol | `trigger_attempts_require_media_recovery_protocol_rejects_dispatch_without_protocol` |
| `zy_check_inspected_guardrail_binding` | BEFORE UPDATE | `niu_check_inspected_guardrail_binding` | input inspection binding required; inspected guardrail policy changed; input inspection result required; required detector inspection missing; invalid required image inspection; required image request binding missing; required image inspection coverage missing | `trigger_attempts_zy_check_inspected_guardrail_binding_requires_input_binding` |

## Rules moved into Rust-owned transactions

`require_gateway_retry_deadline` was removed from `attempts` in migration `0429_gateway_retry_deadline_rust_owned.sql`. `Store::mark_dispatched` performs the same static deadline check after taking the attempt row lock and returns `StoreError::GatewayRequestDeadlineExceeded` (SQLSTATE `P0028` meaning). The Rust-owned rule is tested by `trigger_attempts_require_gateway_retry_deadline_is_rust_owned`.

## Complete trigger inventory

### `account_organization_creation_receipts`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_account_organization_creation_receipts` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `admin_mode_events`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_admin_mode_events` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `api_keys`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_key_slug` | BEFORE INSERT OR UPDATE | `preserve_key_slug` | key slug is immutable | none | untested |
| `protect_key_spending_identity` | BEFORE INSERT OR UPDATE | `protect_key_spending_identity` | key spending identity is immutable | billing | untested |
### `asset_group_create_intents`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `asset_group_intent_transitions` | BEFORE UPDATE OR DELETE | `preserve_asset_group_intent` | asset creation intent is immutable outside forward transitions or authorized content erasure | none | untested |
| `clear_asset_group_request_cleanup_retry` | AFTER UPDATE (request_body) | `clear_asset_content_cleanup_retry` | side-effect; no RAISE | none | untested |
### `asset_group_deletion_claims`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_group_deletion_claim` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_group_deletion_consent_revocations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_group_deletion_consent_revocation` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_group_deletion_consents`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_group_deletion_consent` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_group_deletion_outcomes`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_group_deletion_outcome` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_group_dispatch_authorizations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_group_dispatch_authorization` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_group_dispatch_outcomes`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_group_dispatch_outcome` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_group_read_claims`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_group_read_claim` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_group_read_outcomes`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_group_read_outcome` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_group_read_result_deletions`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_group_read_result_deletion` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_group_read_results`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `clear_asset_group_read_cleanup_retry` | AFTER UPDATE (deleted_at) | `clear_asset_content_cleanup_retry` | side-effect; no RAISE | none | untested |
| `immutable_asset_group_read_result` | BEFORE UPDATE OR DELETE | `preserve_asset_group_read_result` | asset read results permit erasure only | none | untested |
### `asset_group_request_deletions`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `asset_group_request_deletion_immutable` | BEFORE UPDATE OR DELETE | `preserve_asset_group_request_deletion` | asset request deletion event is immutable | none | untested |
### `asset_group_update_claims`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_group_update_claim` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_group_update_intents`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_group_update_intent` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_group_update_outcomes`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_group_update_outcome` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_group_update_patches`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `clear_asset_group_update_cleanup_retry` | AFTER UPDATE (deleted_at) | `clear_asset_content_cleanup_retry` | side-effect; no RAISE | none | untested |
| `immutable_asset_group_update_patch` | BEFORE UPDATE OR DELETE | `preserve_asset_group_update_patch` | asset group update patch permits erasure only | none | untested |
### `asset_group_update_reads`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_group_update_read` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_group_update_reconciliations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_group_update_reconciliation` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_image_ingestion_claims`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_image_ingestion_claim` | BEFORE UPDATE OR DELETE | `guard_asset_image_ingestion_claim` | accounting records are immutable | none | untested |
### `asset_image_ingestion_consent_revocations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_image_ingestion_consent_revocation` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `asset_image_ingestion_consents`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_image_ingestion_consent` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `asset_image_ingestion_outcomes`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_image_ingestion_outcome` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
| `resolve_asset_image_ingestion_claim` | AFTER INSERT | `mark_asset_image_ingestion_claim_resolved` | side-effect; no RAISE | none | untested |
### `asset_image_source_access`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_image_source_access` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `asset_image_source_deliveries`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_image_source_delivery` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `asset_listing_claims`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_listing_claim` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_listing_outcomes`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_listing_outcome` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_listing_result_deletions`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_listing_result_deletion` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_listing_results`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `clear_asset_listing_cleanup_retry` | AFTER UPDATE (deleted_at) | `clear_asset_content_cleanup_retry` | side-effect; no RAISE | none | untested |
| `immutable_asset_listing_result` | BEFORE UPDATE OR DELETE | `preserve_asset_listing_result` | asset listing results permit erasure only | none | untested |
### `asset_lookup_claims`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_lookup_claim` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_lookup_outcomes`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_lookup_outcome` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_lookup_result_deletions`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_lookup_result_deletion` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_lookup_results`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `clear_asset_lookup_cleanup_retry` | AFTER UPDATE (deleted_at) | `clear_asset_content_cleanup_retry` | side-effect; no RAISE | none | untested |
| `immutable_asset_lookup_result` | BEFORE UPDATE OR DELETE | `preserve_asset_lookup_result` | asset lookup results permit erasure only | none | untested |
### `asset_operation_authorization_revocations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_operation_authorization_revocation` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `asset_operation_authorizations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_operation_authorization` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `attempt_route_generations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_attempt_route_generations` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `attempts`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `attempts_require_current_supplier_qualification` | BEFORE UPDATE (execution) | `niu_guard_qualified_supplier_dispatch` | supplier offer authorization changed before dispatch | direct attempt | untested |
| `connection_incident_execution_recovery` | AFTER UPDATE (execution) | `niu_resolve_connection_incidents_on_evidence` | side-effect; no RAISE | direct attempt | untested |
| `dispatch_requires_current_model_guardrails` | BEFORE UPDATE (execution) | `niu_check_dispatch_model_guardrails` | access guardrail changed before dispatch | direct attempt | `trigger_attempts_dispatch_requires_current_model_guardrails_rejects_denied_model` |
| `enforce_key_concurrency` | AFTER INSERT OR UPDATE (dispatched_at) | `niu_enforce_key_concurrency` | API key concurrent request limit reached | direct attempt | `trigger_attempts_enforce_key_concurrency_blocks_second_unresolved_dispatch` |
| `enforce_key_request_rate` | AFTER INSERT OR UPDATE (dispatched_at) | `niu_enforce_key_request_rate` | API key request rate is disabled; API key request rate exhausted | direct attempt | `trigger_attempts_enforce_key_request_rate_blocks_disabled_and_exhausted` |
| `enforce_key_token_rate` | AFTER INSERT OR UPDATE (dispatched_at) | `niu_enforce_key_token_rate` | API key token rate exhausted; Token budget requires supported bounded text input; Existing unknown usage has no token budget | direct attempt | `trigger_attempts_enforce_key_token_rate_requires_bound_and_rejects_exhaustion` |
| `enforce_vendor_request_rate` | AFTER INSERT OR UPDATE (dispatched_at) | `niu_enforce_vendor_request_rate` | Conflicting credential bindings; Credential rate policy missing; Upstream credential request rate is disabled; Upstream credential request rate exhausted | direct attempt | `trigger_attempts_enforce_vendor_request_rate_rejects_disabled_credential` |
| `guard_platform_media_liability_dispatch` | BEFORE UPDATE (execution) | `guard_platform_media_liability_dispatch` | Platform media liability qualification changed before dispatch | direct attempt | untested |
| `immutable_dispatch_provider_snapshot` | BEFORE UPDATE (dispatch_provider) | `niu_guard_dispatch_provider_snapshot` | dispatch Provider snapshot is immutable | direct attempt | `trigger_attempts_immutable_dispatch_provider_snapshot_rejects_change_after_dispatch` |
| `media_offer_requires_media_dispatch` | BEFORE UPDATE (execution) | `niu_guard_media_offer_dispatch` | media offer requires pinned media pricing, liability and route | direct attempt | untested |
| `preserve_attempt_public_reference` | BEFORE UPDATE (public_reference) | `preserve_attempt_public_reference` | public run references are permanent | direct attempt | `trigger_attempts_preserve_attempt_public_reference_rejects_rename` |
| `recheck_managed_attempt_route` | BEFORE INSERT OR UPDATE (execution) | `recheck_managed_attempt_route` | route pool changed before dispatch; managed route changed before dispatch | direct attempt | `trigger_attempts_recheck_managed_attempt_route_rejects_stale_vendor_revision` |
| `require_current_ingested_video_deadline` | BEFORE UPDATE (dispatched_at) | `require_current_ingested_video_deadline` | ingested image dispatch deadline elapsed | direct attempt | untested |
| `require_current_media_dispatch_route` | BEFORE INSERT OR UPDATE (execution) | `require_current_media_dispatch_route` | media dispatch route changed | direct attempt | `trigger_attempts_require_current_media_dispatch_route_rejects_stale_route` |
| `require_customer_balance_dispatch` | BEFORE INSERT OR UPDATE (execution) | `require_customer_balance_dispatch` | personal dispatch ownership, policy or route changed; personal dispatch has incompatible accounting; Credits dispatch requires its pinned unit price and fully funded ranges; Currency dispatch cannot reuse Credits accounting; prepaid dispatch requires a funded retail reservation | direct attempt | `trigger_attempts_require_customer_balance_dispatch_rejects_unfunded_currency_dispatch` |
| `require_media_completion_evidence` | BEFORE UPDATE (execution) | `require_media_completion_evidence` | media completion unresolved | direct attempt | `trigger_attempts_require_media_completion_evidence_rejects_unresolved_job` |
| `require_media_output_before_dispatch` | BEFORE UPDATE (dispatched_at) | `require_media_output_before_dispatch` | media dispatch requires effective output snapshot | direct attempt | `trigger_attempts_require_media_output_before_dispatch_rejects_missing_snapshot` |
| `require_media_recovery_protocol` | BEFORE UPDATE | `require_media_recovery_protocol` | video dispatch requires original recovery protocol | direct attempt | `trigger_attempts_require_media_recovery_protocol_rejects_dispatch_without_protocol` |
| `zy_check_inspected_guardrail_binding` | BEFORE UPDATE (execution) | `niu_check_inspected_guardrail_binding` | input inspection binding required; inspected guardrail policy changed; input inspection result required; required detector inspection missing; invalid required image inspection; required image request binding missing; required image inspection coverage missing | direct attempt | `trigger_attempts_zy_check_inspected_guardrail_binding_requires_input_binding` |
### `batch_guardrail_rejections`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_batch_guardrail_rejection` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
### `branding_configuration_events`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_branding_configuration_event` | BEFORE UPDATE OR DELETE | `preserve_asset_operation_authorization` | asset operation authorization events are immutable | none | untested |
### `chat_sessions`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `preserve_chat_public_reference` | BEFORE UPDATE (public_reference) | `preserve_chat_public_reference` | public chat references are permanent | none | untested |
| `sync_chat_session_payload_metadata` | BEFORE INSERT OR UPDATE (payload) | `niu_sync_chat_session_payload_metadata` | side-effect; no RAISE | none | untested |
### `company_creation_receipts`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_company_creation_receipt` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `connection_incident_observations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `incident_workspace_observed` | AFTER INSERT | `niu_record_incident_workspace` | side-effect; no RAISE | attempt-adjacent | untested |
### `cost_entries`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_cost` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `customer_attempt_balance_accounts`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `a_personal_customer_balance` | BEFORE INSERT | `reject_personal_attempt_accounting` | personal attempts cannot receive commercial accounting | attempt-adjacent | untested |
| `immutable_customer_balance_binding` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `customer_attempt_tariffs`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `a_personal_customer_tariff` | BEFORE INSERT | `reject_personal_attempt_accounting` | personal attempts cannot receive commercial accounting | attempt-adjacent | untested |
| `bind_customer_attempt_operation_tariff` | BEFORE INSERT | `bind_operation_customer_tariff` | Customer operation tariff cannot change | attempt-adjacent | untested |
| `bind_customer_operation_funding` | BEFORE INSERT | `bind_operation_funding_source` | Operation funding source cannot change | attempt-adjacent | untested |
| `exclusive_customer_text_meter` | BEFORE INSERT | `enforce_customer_meter_exclusivity` | customer text or Credits media tariff already bound; customer media tariff already bound | attempt-adjacent | untested |
| `immutable_customer_binding` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `customer_balance_accounts`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `guard_customer_account_posted_balance` | BEFORE INSERT OR UPDATE (posted_balance_nanos) | `protect_customer_account_posted_balance` | posted_balance_nanos must start at zero; posted_balance_nanos is maintained only by ledger entries | billing | untested |
| `platform_currency_guard` | BEFORE INSERT OR UPDATE (organization_id, currency, credit_limit_nanos, warning_threshold_nanos, policy_revision) | `niu_require_platform_currency` | Use the configured platform currency % | billing | `trigger_customer_balance_accounts_platform_currency_guard_rejects_mismatched_money_row` |
### `customer_balance_consumption_allocations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `check_customer_grant_credit_restoration` | AFTER INSERT | `check_customer_grant_credit_restoration` | Late gift refund requires complete exact restoration provenance | billing | untested |
| `immutable_customer_balance_consumption_allocation` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `validate_customer_balance_consumption_allocation` | BEFORE INSERT | `validate_customer_balance_consumption_allocation` | consumption allocation requires an exact scoped balance entry; refund allocation requires its original scoped charge | billing | untested |
### `customer_balance_entries`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `a00_maintain_customer_account_posted_balance_on_entry` | AFTER INSERT | `maintain_customer_account_posted_balance` | side-effect; no RAISE | attempt-adjacent | untested |
| `allocate_customer_balance_consumption` | AFTER INSERT | `allocate_customer_balance_consumption` | Explicit gift pool is inconsistent; Refund exceeds original scoped consumption; Refund gift sources exceed original consumption or applications; Late gift restoration is inconsistent; Late gift refund could not restore its exact sources; Verified prepaid cash pool is inconsistent; Refund exceeds remaining credit or paid cash after gift allowance | attempt-adjacent | untested |
| `enforce_customer_media_debit_capacity` | BEFORE INSERT | `enforce_customer_media_debit_capacity` | media debit exceeds available approved capacity | attempt-adjacent | untested |
| `immutable_customer_balance_entry` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `require_customer_money_funding_mode` | BEFORE INSERT | `require_customer_issuance_mode` | New issuance requires its configured customer billing mode | attempt-adjacent | untested |
| `validate_customer_charge_ledger_source` | BEFORE INSERT | `validate_customer_charge_ledger_source` | customer debit requires one exact charge | attempt-adjacent | untested |
### `customer_balance_grant_corrections`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_balance_grant_correction` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `validate_unused_customer_gift_correction` | BEFORE INSERT | `validate_unused_customer_gift_correction` | Correction requires an exact wholly unused gift with known sources and no open liabilities | billing | untested |
### `customer_balance_grants`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_balance_grant` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `platform_currency_guard` | BEFORE INSERT OR UPDATE (currency) | `niu_require_platform_currency` | Use the configured platform currency % | billing | untested |
| `require_customer_money_grant_mode` | BEFORE INSERT | `require_customer_issuance_mode` | New issuance requires its configured customer billing mode | billing | untested |
| `validate_customer_balance_grant` | BEFORE INSERT | `validate_customer_balance_grant` | noncash grant requires an exact positive adjustment | billing | untested |
| `validate_customer_balance_grant_preparation` | AFTER INSERT | `validate_prepared_customer_balance_grant_match` | grant publication differs from durable intent | billing | untested |
### `customer_balance_policy_revisions`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_balance_policy` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `customer_balance_reservations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `enforce_customer_key_reservation` | BEFORE INSERT | `enforce_customer_key_reservation` | customer workspace spending limit exceeded; key attribution required for bounded spending; customer key spending limit exceeded | attempt-adjacent | untested |
| `enforce_customer_workspace_reservation` | BEFORE INSERT | `enforce_customer_workspace_reservation` | customer workspace spending limit exceeded | attempt-adjacent | untested |
| `protect_customer_balance_reservation` | BEFORE UPDATE OR DELETE | `protect_customer_balance_reservation` | customer reservations cannot be deleted; only a terminal reservation release is permitted; unposted customer liability cannot be released | attempt-adjacent | untested |
### `customer_billing_audit`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_audit` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `customer_charges`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_charge` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `customer_credit_policy_events`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_credit_policy_event` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `validate_customer_credit_policy_event` | BEFORE INSERT | `validate_customer_credit_policy_event` | credit actor requires a new policy in the same transaction | billing | untested |
### `customer_credit_repayments`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_credit_repayment` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `validate_customer_credit_repayment` | BEFORE INSERT | `validate_customer_credit_repayment` | Repayment requires exact known customer credit; Repayment exceeds exact cash or unpaid credit after allowances | billing | untested |
### `customer_credit_sources`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_credit_source` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `validate_customer_credit_source` | BEFORE INSERT | `validate_customer_credit_source` | Credit source requires exact scoped consumption; Credit source differs from deterministic cash and unpaid-credit split | billing | untested |
### `customer_funding_receipts`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `allocate_customer_credit_repayments` | AFTER INSERT | `allocate_customer_credit_repayments` | Verified receipt requires its exact positive funding entry; Outstanding credit is inconsistent; Repayment exceeds exact cash or unpaid credit after allowances | billing | untested |
| `immutable_customer_funding_receipt` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `register_customer_payment_reference` | BEFORE INSERT | `register_customer_payment_reference` | Payment reference already belongs to a different funding target | billing | untested |
### `customer_grant_credit_applications`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_grant_credit_application` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `validate_customer_grant_credit_application` | BEFORE INSERT | `validate_customer_grant_credit_application` | Grant application requires exact known customer credit; Grant application exceeds available gift or exact unpaid credit | billing | untested |
### `customer_grant_credit_refund_restorations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_grant_credit_restoration` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `validate_customer_grant_credit_restoration` | BEFORE INSERT | `validate_customer_grant_credit_restoration` | Late gift restoration exceeds its exact application or refund | billing | untested |
### `customer_grant_policies`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `apply_customer_grant_credit_policy` | AFTER INSERT | `apply_customer_grant_credit_policy` | Unpaid credit is inconsistent; Grant application exceeds available gift or exact unpaid credit | billing | untested |
| `immutable_customer_grant_policy` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `validate_customer_grant_policy` | BEFORE INSERT | `validate_customer_grant_policy` | Grant policy must be published with a fresh grant journal; Debt-first grant requires complete cash and credit provenance | billing | untested |
### `customer_invoice_entries`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_invoice_entry` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `validate_customer_invoice_charge_source` | BEFORE INSERT | `validate_customer_invoice_charge_source` | invoice entry requires one scoped charge within its currency and period | attempt-adjacent | untested |
### `customer_invoice_payments`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_payment` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `customer_invoices`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_invoice` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `customer_key_limit_history`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_key_limit_history` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `customer_key_spending_limits`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `platform_currency_guard` | BEFORE INSERT OR UPDATE | `niu_require_platform_currency` | Use the configured platform currency % | billing | untested |
| `protect_customer_key_limit` | BEFORE INSERT OR UPDATE OR DELETE | `protect_customer_key_limit` | key limits cannot be deleted; invalid key limit revision; unattributed liabilities require reconciliation before setting a key limit; key limit below committed liability | billing | untested |
### `customer_media_attempt_pricing`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `bind_customer_media_operation_funding` | BEFORE INSERT | `bind_operation_funding_source` | Operation funding source cannot change | attempt-adjacent | untested |
| `exclusive_customer_media_meter` | BEFORE INSERT | `enforce_customer_meter_exclusivity` | customer text or Credits media tariff already bound; customer media tariff already bound | attempt-adjacent | untested |
| `immutable_customer_media_pricing` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `separate_personal_media_pricing` | BEFORE INSERT | `separate_personal_media_accounting` | personal route conflicts with customer media pricing; customer media pricing conflicts with personal route | attempt-adjacent | untested |
### `customer_media_charges`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_media_charge` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `customer_media_liability_bounds`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_media_liability` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `customer_media_rate_cards`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_media_rate_cards` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
| `platform_currency_guard` | BEFORE INSERT OR UPDATE (document) | `niu_require_platform_currency` | Use the configured platform currency % | none | untested |
### `customer_media_rate_retirements`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_media_rate_retirements` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
| `valid_customer_media_rate_retirement` | BEFORE INSERT | `validate_customer_media_rate_retirement` | invalid media rate retirement | none | untested |
### `customer_media_usage_observations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_media_usage` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `validate_customer_media_usage_observation` | BEFORE INSERT | `validate_customer_media_usage_observation` | customer media usage observation requires a bound customer media tariff | attempt-adjacent | untested |
### `customer_operation_tariffs`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_operation_tariff` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `customer_payment_references`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_payment_reference` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `customer_tariff_revisions`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_tariff` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `platform_currency_guard` | BEFORE INSERT OR UPDATE (currency) | `niu_require_platform_currency` | Use the configured platform currency % | billing | untested |
| `validate_customer_discount_revision` | BEFORE INSERT | `protect_customer_discount_revision` | Discount baseline or resulting rates conflict | billing | untested |
### `customer_topup_checkout`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `adapter_checkout_url` | BEFORE INSERT | `require_adapter_checkout_url` | Invalid checkout origin; Invalid checkout URL | billing | untested |
| `immutable_customer_topup_checkout` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `require_checkout_payment_identity` | BEFORE INSERT | `require_checkout_payment_identity` | checkout requires a saved payment identity | billing | untested |
### `customer_topup_closures`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `guard_customer_topup_closure` | BEFORE INSERT | `guard_topup_terminal_state` | Payment already settled; Payment already closed | billing | untested |
| `immutable_customer_topup_closure` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `customer_topup_creation_claims`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_topup_creation_claim` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `customer_topup_notifications`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_topup_notification` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `customer_topup_orders`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_topup_order` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `platform_currency_guard` | BEFORE INSERT OR UPDATE (currency) | `niu_require_platform_currency` | Use the configured platform currency % | billing | untested |
### `customer_topup_provider_orders`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_topup_provider_order` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `customer_topup_settlements`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `guard_customer_topup_settlement` | BEFORE INSERT | `guard_topup_terminal_state` | Payment already settled; Payment already closed | billing | untested |
| `immutable_customer_topup_settlement` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `validate_customer_unit_settlement` | BEFORE INSERT | `validate_customer_unit_settlement` | Credits receipt must match its bound payment; Credits settlement must match its issued lot and receipt | billing | untested |
### `customer_unit_attempt_tariffs`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_unit_attempt_tariff` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `validate_customer_unit_attempt_tariff` | BEFORE INSERT | `validate_customer_unit_tariff_binding` | Credits tariff must match the original operation and unsent attempt | attempt-adjacent | untested |
### `customer_unit_configuration`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `validate_customer_unit_mode_change` | BEFORE UPDATE (billing_mode) | `validate_customer_unit_mode_change` | Billing mode requires an unexpired compatible preview and immutable change record; Customer obligations prevent billing mode change | none | untested |
### `customer_unit_definitions`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_unit_definition` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `customer_unit_funding_receipts`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_unit_receipt` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `register_customer_unit_payment_reference` | BEFORE INSERT | `register_customer_payment_reference` | Payment reference already belongs to a different funding target | billing | untested |
| `validate_customer_unit_receipt` | BEFORE INSERT | `validate_customer_unit_settlement` | Credits receipt must match its bound payment; Credits settlement must match its issued lot and receipt | billing | untested |
### `customer_unit_key_limit_history`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_unit_key_limit_history` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `customer_unit_key_spending_limits`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `protect_customer_unit_key_limit` | BEFORE INSERT OR UPDATE OR DELETE | `protect_customer_unit_key_limit` | Credits key spending limits cannot be deleted; Credits key spending limit must target a root spending identity; Credits key spending limit requires a matching sequential history revision; Unattributed Credits liabilities require reconciliation before setting a key limit; Credits key spending limit is below committed liability | billing | untested |
### `customer_unit_lots`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_unit_purchase_lot` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `require_customer_unit_issuance_mode` | BEFORE INSERT | `require_customer_issuance_mode` | New issuance requires its configured customer billing mode | none | untested |
| `validate_customer_unit_purchase_lot` | BEFORE INSERT | `validate_customer_unit_purchase_lot` | Credits lot must match its original quote and immutable payment provenance | billing | untested |
### `customer_unit_media_attempt_tariffs`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_unit_media_attempt_tariff` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `validate_customer_unit_media_attempt_tariff` | BEFORE INSERT | `validate_customer_unit_media_attempt_tariff` | Credits media tariff requires an unsent attempt in the same scope; Credits media tariff conflicts with existing attempt accounting; Credits media tariff, qualification bound or route provenance conflicts | attempt-adjacent | untested |
### `customer_unit_media_charges`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_unit_media_charge` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `customer_unit_media_tariffs`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_unit_media_tariff` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `customer_unit_mode_changes`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_unit_mode_change` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `customer_unit_mode_previews`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_unit_mode_preview` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `customer_unit_operation_tariffs`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_unit_operation_tariff` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `validate_customer_unit_operation_tariff` | BEFORE INSERT | `validate_customer_unit_tariff_binding` | Credits tariff must match the original operation and unsent attempt | billing | untested |
### `customer_unit_purchase_quotes`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_unit_quote` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `validate_customer_unit_quote` | BEFORE INSERT | `validate_customer_unit_quote` | Credits quote must match its exact immutable purchase rule | billing | untested |
### `customer_unit_purchase_reversal_ranges`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `customer_unit_purchase_reversal_range_total` | AFTER INSERT | `validate_customer_unit_purchase_reversal_total` | Credits purchase reversal must equal the sum of its disjoint ranges; Credits purchase reversal cannot discard trailing residual atoms without payment value | billing | untested |
| `immutable_customer_unit_purchase_reversal_range` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `validate_customer_unit_purchase_reversal_range` | BEFORE INSERT | `validate_customer_unit_purchase_reversal_range` | Credits purchase reversal range is occupied, out of bounds or has inexact backing; Credits purchase reversal ranges must be ordered and disjoint | billing | untested |
### `customer_unit_purchase_reversals`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `customer_unit_purchase_reversal_total` | AFTER INSERT | `validate_customer_unit_purchase_reversal_total` | Credits purchase reversal must equal the sum of its disjoint ranges; Credits purchase reversal cannot discard trailing residual atoms without payment value | billing | untested |
| `immutable_customer_unit_purchase_reversal` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `validate_customer_unit_purchase_reversal` | BEFORE INSERT | `validate_customer_unit_purchase_reversal` | Credits purchase reversal must match the original purchase lot and provenance | billing | untested |
### `customer_unit_purchase_rules`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_unit_purchase_rule` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `customer_unit_reservation_extensions`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `customer_unit_extension_total` | AFTER INSERT | `validate_customer_unit_reservation_total` | Credits reservation must be fully backed by disjoint ranges | attempt-adjacent | untested |
| `immutable_customer_unit_extension` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `validate_customer_unit_extension` | BEFORE INSERT | `validate_customer_unit_extension` | Additional Credits capacity must match the unresolved original liability | attempt-adjacent | untested |
### `customer_unit_reservations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `customer_unit_reservation_total` | AFTER INSERT | `validate_customer_unit_reservation_total` | Credits reservation must be fully backed by disjoint ranges | attempt-adjacent | untested |
| `enforce_customer_unit_spending_limits` | BEFORE INSERT | `enforce_customer_unit_spending_limits` | Monetary workspace spending limit requires explicit Credits limit configuration; customer workspace spending limit exceeded; key attribution required for bounded spending; Monetary key spending limit requires explicit Credits limit configuration; customer key spending limit exceeded | attempt-adjacent | untested |
| `immutable_customer_unit_reservation` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `customer_unit_reserved_ranges`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `customer_unit_range_total` | AFTER INSERT | `validate_customer_unit_reservation_total` | Credits reservation must be fully backed by disjoint ranges | attempt-adjacent | untested |
| `immutable_customer_unit_reserved_range` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `validate_customer_unit_range` | BEFORE INSERT | `validate_customer_unit_range` | Credits range is expired, unavailable or already resolved | attempt-adjacent | untested |
### `customer_unit_resolutions`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_unit_resolution` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `validate_customer_unit_resolution` | BEFORE INSERT | `validate_customer_unit_resolution` | Credits charge exceeds reserved capacity; retain the unresolved hold | attempt-adjacent | untested |
### `customer_unit_restorations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_unit_restoration` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `validate_customer_unit_restoration` | BEFORE INSERT | `validate_customer_unit_restoration` | Credits restoration must restore original, not previously restored charge positions | attempt-adjacent | untested |
### `customer_unit_text_charges`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_unit_text_charge` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `customer_unit_text_tariffs`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_unit_text_tariff` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `customer_unit_topups`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_unit_topup` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `validate_customer_unit_topup` | BEFORE INSERT | `validate_customer_unit_topup` | Credits binding requires an unexpired matching quote and an unsubmitted order | billing | untested |
### `customer_unit_workspace_limit_history`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_unit_workspace_limit_history` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `customer_unit_workspace_spending_limits`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `protect_customer_unit_workspace_limit` | BEFORE INSERT OR UPDATE OR DELETE | `protect_customer_unit_workspace_limit` | Credits workspace spending limits cannot be deleted; Credits workspace spending limit requires a matching sequential history revision; Credits workspace spending limit is below committed liability | billing | untested |
### `customer_workspace_limit_history`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_customer_workspace_limit_history` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `customer_workspace_spending_limits`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `platform_currency_guard` | BEFORE INSERT OR UPDATE | `niu_require_platform_currency` | Use the configured platform currency % | billing | untested |
| `protect_customer_workspace_limit` | BEFORE INSERT OR UPDATE OR DELETE | `protect_customer_workspace_limit` | spending limits cannot be deleted; invalid spending limit revision; invalid initial spending limit revision; spending limit below committed customer liability | billing | untested |
| `record_customer_workspace_limit_revision` | AFTER INSERT OR UPDATE | `record_customer_workspace_limit_revision` | invalid workspace limit actor | billing | untested |
### `dispatch_guardrail_decisions`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_dispatch_guardrail_decision` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `dispatch_guardrail_rejections`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_dispatch_guardrail_rejection` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `encryption_rewrap_authorizations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_encryption_rewrap_authorization` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `encryption_rotation_operations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_encryption_rotation_operation` | BEFORE UPDATE OR DELETE | `preserve_encryption_rotation_operation` | encryption rotation history permits completion only | none | untested |
### `evaluation_attempt_bindings`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_evaluation_attempt_binding` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `gateway_admission_denials`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_gateway_admission_denial` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `gateway_retry_attempts`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_gateway_retry_attempt` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `gateway_retry_policies`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_gateway_retry_policy` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `generations_artifact_captures`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `preserve_generation_capture_history` | BEFORE DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
| `preserve_generation_capture_identity` | BEFORE UPDATE | `preserve_generation_capture_identity` | capture source identity and stored outcome are permanent | none | untested |
### `generations_sessions`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `preserve_video_session_public_reference` | BEFORE UPDATE (public_reference) | `preserve_video_session_public_reference` | public Video session references are permanent | none | untested |
### `generations_turn_intents`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_generations_turn_intent` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `generations_turn_tasks`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_generations_task_association` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `generations_turns`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `clear_generations_bound_intent` | AFTER UPDATE | `clear_generations_bound_intent_content` | side-effect; no RAISE | none | untested |
### `guardrail_preparation_denials`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_guardrail_preparation_denial` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
### `image_processing_approvals`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_image_processing_approval` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `image_request_approval_bindings`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_image_request_approval` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `require_scoped_image_approval` | BEFORE INSERT | `require_scoped_image_approval` | image approval does not match prepared request | attempt-adjacent | untested |
### `image_request_bindings`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_image_request` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `require_prepared_image_request` | BEFORE INSERT | `require_prepared_image_request` | image request requires prepared scoped route and policy binding; image positions must be distinct | attempt-adjacent | untested |
### `ingested_image_readiness_claims`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_ingested_image_readiness_claim` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
| `track_ingested_image_readiness_pending` | AFTER INSERT | `niu_track_ingested_image_readiness_pending` | side-effect; no RAISE | none | untested |
### `ingested_image_readiness_outcomes`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `clear_ingested_image_readiness_pending` | AFTER INSERT | `niu_clear_ingested_image_readiness_pending` | side-effect; no RAISE | none | untested |
| `immutable_ingested_image_readiness_outcome` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `ingested_video_request_bindings`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_ingested_video_reference` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `require_prepared_ingested_video_reference` | BEFORE INSERT | `require_prepared_ingested_video_reference` | ingested image requires prepared scoped video request | attempt-adjacent | untested |
### `input_detector_decisions`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_input_detector_decision` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `inspected_guardrail_bindings`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_inspected_guardrail_binding` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `inspected_image_source_approvals`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_inspected_image_source_approvals` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `inspected_image_source_content`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_inspected_image_source_bytes` | BEFORE UPDATE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
| `set_inspected_image_source_content_expiry` | BEFORE INSERT | `set_inspected_image_source_content_expiry` | side-effect; no RAISE | none | untested |
### `inspected_image_source_erasures`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_inspected_image_source_erasure` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `inspected_image_sources`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_inspected_image_source` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `key_attempt_token_bounds`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_key_attempt_token_bounds` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `key_audit_events`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_key_audit` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `key_concurrency_history`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_key_concurrency_history` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `key_guardrail_assignment_events`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_key_guardrail_assignment_event` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
### `key_ip_policy_history`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_key_ip_policy_history` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `key_request_rate_history`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_key_request_rate_history` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `key_token_rate_history`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_key_token_rate_history` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `managed_attempt_routes`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `protect_managed_attempt_route` | BEFORE INSERT OR UPDATE OR DELETE | `protect_managed_attempt_route` | managed route binding is immutable; managed route must bind before dispatch | attempt-adjacent | `trigger_managed_attempt_routes_protect_managed_attempt_route_rejects_update` |
### `media_job_observations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_media_job_observation` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `lock_media_status_attempt` | BEFORE INSERT | `lock_media_status_attempt` | side-effect; no RAISE | attempt-adjacent | untested |
### `media_jobs`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `claim_media_upstream_job` | AFTER INSERT | `claim_media_upstream_job` | side-effect; no RAISE | attempt-adjacent | untested |
| `immutable_media_job_binding` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `require_media_job_recovery_route` | BEFORE INSERT | `require_media_job_recovery_route` | media recovery route required | attempt-adjacent | untested |
### `media_liability_qualification_changes`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_media_liability_change` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
### `media_liability_qualification_heads`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `protect_media_liability_head` | BEFORE INSERT OR UPDATE OR DELETE | `protect_media_liability_head` | New media liability identity starts at version zero; Media liability identity is immutable and requires a new version; Media liability version requires publication history | route/supply | untested |
### `media_liability_qualification_revocations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_media_liability_revocation` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
| `validate_media_liability_revocation` | BEFORE INSERT | `validate_media_liability_qualification` | Media liability revocation cannot extend qualification; Media liability requires current exact qualified supply and nonoverlapping validity | route/supply | untested |
### `media_liability_qualifications`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_media_liability_qualification` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
| `validate_media_liability_qualification` | BEFORE INSERT | `validate_media_liability_qualification` | Media liability revocation cannot extend qualification; Media liability requires current exact qualified supply and nonoverlapping validity | route/supply | untested |
### `media_output_snapshots`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_media_output_snapshot` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `require_unsent_media_output_snapshot` | BEFORE INSERT | `require_unsent_media_output_snapshot` | media output snapshot requires unsent pinned route | attempt-adjacent | untested |
### `media_processing_approvals`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_media_processing_approval` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `media_query_evidence`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_media_query_evidence` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `media_recovery_protocols`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_media_recovery_protocols` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `validate_media_recovery_protocol` | BEFORE INSERT | `validate_media_recovery_protocol` | media recovery protocol must match original unsent route | attempt-adjacent | untested |
### `media_recovery_routes`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_media_recovery_route` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `media_request_approval_bindings`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_media_request_approval_binding` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `require_scoped_media_request_approval` | BEFORE INSERT | `require_scoped_media_request_approval` | media approval requires matching prepared scope and policy epochs | attempt-adjacent | untested |
### `media_request_bindings`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_media_request_binding` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `require_prepared_media_request` | BEFORE INSERT | `require_prepared_media_request` | media request requires prepared scoped route and policy binding; media request positions must be unique | attempt-adjacent | untested |
### `media_result_references`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `clear_media_result_cleanup_retry` | AFTER UPDATE (deleted_at) | `clear_media_result_cleanup_retry` | side-effect; no RAISE | attempt-adjacent | untested |
| `protect_media_result_reference` | BEFORE UPDATE | `protect_media_result_reference` | media result identity, expiry and deletion are permanent | attempt-adjacent | untested |
| `retain_media_result_tombstone` | BEFORE DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `media_submission_keys`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_media_submission_keys` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `media_submission_uncertainty`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_media_submission_uncertainty` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `require_dispatched_media_uncertainty` | BEFORE INSERT | `require_dispatched_media_uncertainty` | dispatched media attempt required | attempt-adjacent | untested |
### `media_transport_timings`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_media_transport_timing` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `require_dispatched_media_timing` | BEFORE INSERT | `require_dispatched_media_uncertainty` | dispatched media attempt required | attempt-adjacent | untested |
### `media_upstream_job_claims`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_media_upstream_job_claim` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `member_invitation_events`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_member_invitation_events` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `model_route_pool_history`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `protect_model_route_pool_history` | BEFORE UPDATE OR DELETE | `protect_model_route_pool_history` | route pool history is immutable | route/supply | untested |
### `model_route_pools`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `protect_model_route_pool` | BEFORE INSERT OR UPDATE OR DELETE | `protect_model_route_pool` | route pool identity or revision conflict | route/supply | `trigger_model_route_pools_protect_model_route_pool_rejects_identity_change` |
| `registry_publication_model_route_pools` | AFTER INSERT OR UPDATE OR DELETE | `niu_require_registry_publication` | Routing configuration was not published | route/supply | untested |
| `registry_writer_model_route_pools` | BEFORE INSERT OR UPDATE OR DELETE | `niu_require_registry_writer` | Routing publication writer required | route/supply | untested |
### `openrouter_generation_references`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_openrouter_generation_reference` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `openrouter_usage_reconciliations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_openrouter_usage_reconciliation` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `operation_funding_sources`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_operation_funding_source` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `operator_audit_events`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_operator_audit` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `operator_creation_receipts`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_operator_creation_receipt` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `organizations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_organization_slug` | BEFORE INSERT OR UPDATE | `preserve_organization_slug` | invalid organization slug; organization slug is already in use; organization slug is immutable | none | untested |
### `output_guardrail_decisions`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_output_guardrail_decision` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `output_guardrail_observations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_output_guardrail_observation` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `payment_callback_verification`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_payment_callback_verification` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `payment_checkout_verification`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_payment_checkout_verification` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `payment_gateway_configuration_events`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_payment_gateway_configuration_events` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `payment_signed_notifications`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_payment_signed_notifications` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `personal_attempt_routes`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `bind_personal_operation_funding` | BEFORE INSERT | `bind_operation_funding_source` | Operation funding source cannot change | attempt-adjacent | untested |
| `validate_personal_attempt_route` | BEFORE INSERT OR UPDATE OR DELETE | `validate_personal_attempt_route` | personal attempt route is immutable; personal route ownership or revision changed; personal route already has commercial accounting | attempt-adjacent | untested |
| `zz_separate_media_personal_route` | BEFORE INSERT | `separate_personal_media_accounting` | personal route conflicts with customer media pricing; customer media pricing conflicts with personal route | attempt-adjacent | untested |
### `personal_vendor_ownership`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `personal_vendor_owner_guard` | BEFORE INSERT OR UPDATE OR DELETE | `niu_personal_vendor_owner_guard` | personal credential ownership is immutable; commercial supply cannot become personal | none | untested |
| `registry_publication_personal_vendor_ownership` | AFTER INSERT OR UPDATE OR DELETE | `niu_require_registry_publication` | Routing configuration was not published | route/supply | untested |
| `registry_writer_personal_vendor_ownership` | BEFORE INSERT OR UPDATE OR DELETE | `niu_require_registry_writer` | Routing publication writer required | none | untested |
### `platform_admin_events`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_platform_admin_events` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `platform_currency`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `platform_currency_immutable` | BEFORE UPDATE OR DELETE | `niu_platform_currency_immutable` | Platform currency is configured once | none | untested |
| `platform_currency_no_truncate` | BEFORE TRUNCATE | `niu_platform_currency_immutable` | Platform currency is configured once | none | untested |
### `platform_retail_price_changes`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_platform_retail_change` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `platform_retail_price_heads`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `platform_currency_guard` | BEFORE INSERT OR UPDATE | `niu_require_platform_currency` | Use the configured platform currency % | billing | untested |
| `protect_platform_retail_price_head` | BEFORE UPDATE OR DELETE | `protect_platform_retail_price_head` | Retail identity is immutable; configuration requires a new version | billing | untested |
### `platform_retail_promotion_retirements`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_platform_retail_retirement` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
| `validate_platform_retail_retirement` | BEFORE INSERT | `validate_platform_retail_revision` | Retail retirement must shorten an existing promotion; Retail schedule identity conflicts; Expected standard publication; Retail discount or effective period conflicts | route/supply | untested |
### `platform_retail_promotions`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_platform_retail_promotion` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
| `validate_platform_retail_promotion` | BEFORE INSERT | `validate_platform_retail_revision` | Retail retirement must shorten an existing promotion; Retail schedule identity conflicts; Expected standard publication; Retail discount or effective period conflicts | route/supply | untested |
### `platform_retail_standard_revisions`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_platform_retail_standard` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
| `validate_platform_retail_standard` | BEFORE INSERT | `validate_platform_retail_revision` | Retail retirement must shorten an existing promotion; Retail schedule identity conflicts; Expected standard publication; Retail discount or effective period conflicts | route/supply | untested |
### `prepared_customer_balance_grants`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_prepared_customer_balance_grant` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `require_customer_money_grant_mode` | BEFORE INSERT | `require_customer_issuance_mode` | New issuance requires its configured customer billing mode | billing | untested |
| `validate_prepared_customer_balance_grant_match` | AFTER INSERT | `validate_prepared_customer_balance_grant_match` | grant publication differs from durable intent | billing | untested |
### `price_revisions`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_price` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `procurement_configuration_events`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `preserve_procurement_configuration_events` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `project_budgets`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `platform_currency_guard` | BEFORE INSERT OR UPDATE (currency, limit_nanos) | `niu_require_platform_currency` | Use the configured platform currency % | none | untested |
### `projects`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_workspace_route_slug` | BEFORE INSERT OR UPDATE | `preserve_workspace_route_slug` | invalid workspace slug; workspace slug is already in use; workspace slug is immutable | route/supply | untested |
### `provider_attempt_offers`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `a_personal_supplier_offer` | BEFORE INSERT | `reject_personal_attempt_accounting` | personal attempts cannot receive commercial accounting | attempt-adjacent | untested |
| `immutable_provider_binding` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `pin_supplier_attempt_review` | BEFORE INSERT | `niu_pin_supplier_attempt_review` | supplier attempt lacks one current commercial authorization | attempt-adjacent | untested |
| `provider_offer_binding_requires_qualification` | BEFORE INSERT | `niu_guard_provider_offer_binding` | supplier offer lacks current qualification evidence | attempt-adjacent | untested |
### `provider_audit_events`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_provider_audit` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
### `provider_businesses`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_provider_slug` | BEFORE INSERT OR UPDATE | `preserve_provider_slug` | provider slug is immutable | route/supply | untested |
| `registry_publication_supplier_review` | AFTER UPDATE (current_qualification_review) | `niu_require_registry_publication` | Routing configuration was not published | route/supply | untested |
| `registry_writer_supplier_review` | BEFORE UPDATE (current_qualification_review) | `niu_require_registry_writer` | Routing publication writer required | route/supply | untested |
### `provider_earnings`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_provider_earning` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `supplier_earning_meter` | BEFORE INSERT | `enforce_supplier_media_binding` | supplier binding mismatch; supplier price must precede execution; supplier meter mismatch | attempt-adjacent | untested |
### `provider_offer_authorization_revocations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_provider_offer_authorization_revocation` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
| `registry_publication_provider_offer_authorization_revocations` | AFTER INSERT OR UPDATE OR DELETE | `niu_require_registry_publication` | Routing configuration was not published | route/supply | untested |
| `registry_writer_provider_offer_authorization_revocations` | BEFORE INSERT OR UPDATE OR DELETE | `niu_require_registry_writer` | Routing publication writer required | route/supply | untested |
### `provider_offer_authorizations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_provider_offer_authorization` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
| `registry_publication_provider_offer_authorizations` | AFTER INSERT OR UPDATE OR DELETE | `niu_require_registry_publication` | Routing configuration was not published | route/supply | untested |
| `registry_writer_provider_offer_authorizations` | BEFORE INSERT OR UPDATE OR DELETE | `niu_require_registry_writer` | Routing publication writer required | route/supply | untested |
### `provider_offer_qualification_reviews`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_provider_offer_qualification_review` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
| `offer_review_personal_guard` | BEFORE INSERT | `niu_offer_review_personal_guard` | personal credentials cannot receive commercial offer reviews | route/supply | untested |
| `registry_publication_provider_offer_qualification_reviews` | AFTER INSERT OR UPDATE OR DELETE | `niu_require_registry_publication` | Routing configuration was not published | route/supply | untested |
| `registry_writer_provider_offer_qualification_reviews` | BEFORE INSERT OR UPDATE OR DELETE | `niu_require_registry_writer` | Routing publication writer required | route/supply | untested |
### `provider_offer_revisions`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_provider_rate` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
| `platform_currency_guard` | BEFORE INSERT OR UPDATE (currency) | `niu_require_platform_currency` | Use the configured platform currency % | route/supply | untested |
### `provider_offers`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `commercial_offer_personal_guard` | BEFORE INSERT OR UPDATE | `niu_commercial_offer_personal_guard` | personal credentials cannot supply commercial offers | route/supply | untested |
| `offer_revision_invalidates_authorization` | BEFORE UPDATE (current_revision) | `niu_invalidate_offer_authorization_on_revision` | side-effect; no RAISE | route/supply | untested |
| `provider_offer_activation_requires_qualification` | BEFORE INSERT OR UPDATE (active, current_revision) | `niu_guard_provider_offer_activation` | supplier offer lacks current qualification evidence | route/supply | untested |
| `registry_publication_provider_offers` | AFTER INSERT OR UPDATE OR DELETE | `niu_require_registry_publication` | Routing configuration was not published | route/supply | untested |
| `registry_writer_provider_offers` | BEFORE INSERT OR UPDATE OR DELETE | `niu_require_registry_writer` | Routing publication writer required | route/supply | untested |
### `provider_price_evidence`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_provider_price_evidence` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `provider_qualification_reviews`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_provider_qualification_review` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
| `registry_publication_provider_qualification_reviews` | AFTER INSERT OR UPDATE OR DELETE | `niu_require_registry_publication` | Routing configuration was not published | route/supply | untested |
| `registry_writer_provider_qualification_reviews` | BEFORE INSERT OR UPDATE OR DELETE | `niu_require_registry_writer` | Routing publication writer required | route/supply | untested |
### `provider_qualification_revocations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_provider_qualification_revocation` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
| `registry_publication_provider_qualification_revocations` | AFTER INSERT OR UPDATE OR DELETE | `niu_require_registry_publication` | Routing configuration was not published | route/supply | untested |
| `registry_writer_provider_qualification_revocations` | BEFORE INSERT OR UPDATE OR DELETE | `niu_require_registry_writer` | Routing publication writer required | route/supply | untested |
### `provider_settlement_entries`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_provider_settlement_entry` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
### `provider_settlements`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_provider_settlement` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
### `quota_observations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_quota_updates` | BEFORE UPDATE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `request_failures`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `preserve_request_failure` | BEFORE UPDATE | `preserve_request_failure` | request failure observation is immutable | attempt-adjacent | untested |
### `request_timings`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `connection_incident_timing_recovery` | AFTER INSERT OR UPDATE | `niu_resolve_connection_incidents_on_evidence` | side-effect; no RAISE | attempt-adjacent | untested |
### `retail_media_attempt_prices`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_retail_media_attempt_price` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `validate_retail_media_attempt_price` | BEFORE INSERT | `validate_retail_media_attempt_price` | Platform media standard selection conflicts; Platform media promotion precedence conflicts; Platform media snapshot, price, bound or route provenance conflicts | attempt-adjacent | untested |
### `retail_media_enrollment_changes`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_retail_media_enrollment_change` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
### `retail_media_enrollments`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `protect_retail_media_enrollment` | BEFORE INSERT OR UPDATE OR DELETE | `protect_retail_media_enrollment` | Media enrollment starts in legacy mode at version zero; Media enrollment identity is immutable and requires a new version; Media enrollment requires matching published selling identity and existing currency account; Media enrollment requires exact publication history | route/supply | untested |
### `retail_text_enrollment_changes`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_retail_text_enrollment_change` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
### `retail_text_enrollments`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `protect_retail_text_enrollment` | BEFORE INSERT OR UPDATE OR DELETE | `protect_retail_text_enrollment` | New retail enrollment must start in legacy mode at version zero; Retail enrollment identity is immutable and requires a new version; Retail enrollment requires the matching published text identity; Retail enrollment requires its exact publication history | route/supply | untested |
### `retail_text_materializations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_retail_text_materialization` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
| `validate_retail_text_materialization` | BEFORE INSERT | `validate_retail_text_materialization` | Materialized text price differs from its published schedule | route/supply | untested |
### `retail_text_operation_prices`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_retail_text_operation_price` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | billing | untested |
| `validate_retail_text_operation_price` | BEFORE INSERT | `validate_retail_text_operation_price` | Retail provenance must match the pinned operation price; Standard price cannot claim a promotion scope; Retail promotion customer scope conflicts | billing | untested |
### `routing_registry_generations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_routing_registry_generations` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
### `supplier_media_attempt_pricing`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_supplier_media_pricing` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `supplier_media_binding` | BEFORE INSERT | `enforce_supplier_media_binding` | supplier binding mismatch; supplier price must precede execution; supplier meter mismatch | attempt-adjacent | untested |
### `supplier_media_rate_cards`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_supplier_media_cards` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
| `platform_currency_guard` | BEFORE INSERT OR UPDATE (document) | `niu_require_platform_currency` | Use the configured platform currency % | none | untested |
### `supplier_media_rate_retirements`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_supplier_media_retirement` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
| `valid_supplier_media_retirement` | BEFORE INSERT | `validate_supplier_media_rate_retirement` | invalid supplier media rate retirement | none | untested |
### `vendor_asset_management_credentials`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_management_credential_revision` | BEFORE UPDATE OR DELETE | `preserve_asset_management_credential_revision` | asset management credential revisions are immutable except revoked-secret erasure | none | untested |
### `vendor_asset_management_erasures`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_management_erasure` | BEFORE UPDATE OR DELETE | `preserve_asset_management_revocation` | asset management revocations are immutable | none | untested |
### `vendor_asset_management_revocations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_asset_management_revocation` | BEFORE UPDATE OR DELETE | `preserve_asset_management_revocation` | asset management revocations are immutable | none | untested |
### `vendor_audit_events`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_vendor_audit_events` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `vendor_models`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `registry_publication_vendor_models` | AFTER INSERT OR UPDATE OR DELETE | `niu_require_registry_publication` | Routing configuration was not published | route/supply | untested |
| `registry_writer_vendor_models` | BEFORE INSERT OR UPDATE OR DELETE | `niu_require_registry_writer` | Routing publication writer required | route/supply | untested |
| `supplier_model_requires_new_review` | AFTER UPDATE (vendor_id, upstream_model, capabilities) | `niu_invalidate_supplier_model_qualification` | side-effect; no RAISE | route/supply | untested |
### `vendor_request_rate_history`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_vendor_request_rate_history` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `vendor_supplier_ownership`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `registry_publication_vendor_supplier_ownership` | AFTER INSERT OR UPDATE OR DELETE | `niu_require_registry_publication` | Routing configuration was not published | route/supply | untested |
| `registry_writer_vendor_supplier_ownership` | BEFORE INSERT OR UPDATE OR DELETE | `niu_require_registry_writer` | Routing publication writer required | none | untested |
### `vendors`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `initialize_vendor_request_rate` | AFTER INSERT | `initialize_vendor_request_rate` | side-effect; no RAISE | none | untested |
| `registry_publication_vendors` | AFTER INSERT OR UPDATE OR DELETE (name, bootstrap_name, adapter, api_base, enabled, revision) | `niu_require_registry_publication` | Routing configuration was not published | route/supply | untested |
| `registry_writer_vendors` | BEFORE INSERT OR UPDATE OR DELETE (name, bootstrap_name, adapter, api_base, enabled, revision) | `niu_require_registry_writer` | Routing publication writer required | none | untested |
| `serialize_vendor_credential_update` | BEFORE UPDATE (credential_ciphertext) | `niu_serialize_vendor_credential_update` | side-effect; no RAISE | none | untested |
| `supplier_configuration_requires_new_review` | AFTER UPDATE (adapter, api_base, credential_ciphertext) | `niu_invalidate_supplier_route_qualification` | side-effect; no RAISE | none | untested |
### `video_composer_drafts`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `protect_retained_video_composer_draft` | BEFORE DELETE | `protect_retained_video_composer_draft` | retained Video composer content protects its workspace | none | untested |
### `video_submission_intents`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `preserve_video_input_public_reference` | BEFORE UPDATE (public_reference) | `preserve_video_input_public_reference` | public Video input references are permanent | none | untested |
| `protect_video_submission_intent` | BEFORE UPDATE | `protect_video_submission_intent` | video intent identity is immutable; only content deletion is allowed | none | untested |
| `retain_video_submission_intent` | BEFORE DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `workspace_asset_library`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_workspace_asset_identity` | BEFORE UPDATE OR DELETE | `preserve_workspace_asset_identity` | workspace asset identity and tombstones are immutable | none | untested |
### `workspace_asset_library_content`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_workspace_asset_bytes` | BEFORE UPDATE OR DELETE | `preserve_workspace_asset_bytes` | workspace asset content permits authorized rotation or deletion only | none | untested |
| `require_live_workspace_asset_content` | BEFORE INSERT | `require_live_workspace_asset_content` | workspace asset content requires a live identity | none | untested |
### `workspace_asset_library_events`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_workspace_asset_event` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `workspace_asset_video_request_bindings`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_workspace_asset_video_binding` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | attempt-adjacent | untested |
| `require_prepared_workspace_asset_video` | BEFORE INSERT | `require_prepared_workspace_asset_video` | workspace material requires a prepared scoped image request | attempt-adjacent | untested |
### `workspace_creation_receipts`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_workspace_creation_receipt` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `workspace_evaluation_history`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_workspace_evaluation_history` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `workspace_evaluation_runs`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_workspace_evaluation_run` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `workspace_event_subscription_history`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_workspace_event_subscription_history` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `workspace_events`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_workspace_event` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | none | untested |
### `workspace_model_pool_history`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `immutable_workspace_pool_history` | BEFORE UPDATE OR DELETE | `reject_accounting_mutation` | accounting records are immutable; append a new revision or correction | route/supply | untested |
### `workspace_provider_asset_groups`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `preserve_workspace_provider_group` | BEFORE UPDATE OR DELETE | `preserve_workspace_provider_asset_identity` | Provider object history is durable; Provider object identity is immutable; Provider group route is immutable; Provider asset parent is immutable; Provider reference cannot be replaced | route/supply | untested |
### `workspace_provider_asset_operations`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `preserve_workspace_provider_operation` | BEFORE UPDATE OR DELETE | `preserve_workspace_provider_operation` | Provider mutation identity is immutable; Provider mutation diagnostic is immutable; Provider mutation outcome cannot be replayed | route/supply | untested |
### `workspace_provider_assets`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `preserve_workspace_provider_asset` | BEFORE UPDATE OR DELETE | `preserve_workspace_provider_asset_identity` | Provider object history is durable; Provider object identity is immutable; Provider group route is immutable; Provider asset parent is immutable; Provider reference cannot be replaced | route/supply | untested |
### `workspace_provider_verification_sessions`

| Trigger | Timing / event | Function | Invariant (derived) | Attempt path | Named test |
| --- | --- | --- | --- | --- | --- |
| `preserve_workspace_provider_verification` | BEFORE INSERT OR UPDATE OR DELETE | `preserve_workspace_provider_verification` | Verification starts as an unsubmitted intent; Verification history is durable; Verification identity is immutable; Verification envelope permits authorized rotation only; Verification expiry is immutable; Verified group binding is immutable; Terminal verification cannot be revived; Verification must claim before dispatch; Verified group must retain original scope and account | route/supply | untested |

## Function inventory

All public functions in the effective schema. Trigger functions are marked; helper functions are listed because they carry the same invariants and are callable directly.

| Function | Arguments | Returns trigger | Trigger users | Raised codes | Source migration |
| --- | --- | --- | --- | --- | --- |
| `allocate_customer_balance_consumption` | - | yes | `allocate_customer_balance_consumption` | `23514` | 0001_initial_schema.sql |
| `allocate_customer_credit_repayments` | - | yes | `allocate_customer_credit_repayments` | `23514` | 0001_initial_schema.sql |
| `allocate_customer_credit_sources` | - | yes | - | - | 0001_initial_schema.sql |
| `apply_customer_grant_credit_policy` | - | yes | `apply_customer_grant_credit_policy` | `23514` | 0001_initial_schema.sql |
| `bind_operation_customer_tariff` | - | yes | `bind_customer_attempt_operation_tariff` | `23514` | 0001_initial_schema.sql |
| `bind_operation_funding_source` | - | yes | `bind_customer_media_operation_funding`, `bind_customer_operation_funding`, `bind_personal_operation_funding` | `23514` | 0001_initial_schema.sql |
| `check_customer_grant_credit_restoration` | - | yes | `check_customer_grant_credit_restoration` | `23514` | 0001_initial_schema.sql |
| `claim_media_upstream_job` | - | yes | `claim_media_upstream_job` | - | 0001_initial_schema.sql |
| `clear_asset_content_cleanup_retry` | - | yes | `clear_asset_group_read_cleanup_retry`, `clear_asset_group_request_cleanup_retry`, `clear_asset_group_update_cleanup_retry`, `clear_asset_listing_cleanup_retry`, `clear_asset_lookup_cleanup_retry` | - | 0001_initial_schema.sql |
| `clear_generations_bound_intent_content` | - | yes | `clear_generations_bound_intent` | - | 0001_initial_schema.sql |
| `clear_media_result_cleanup_retry` | - | yes | `clear_media_result_cleanup_retry` | - | 0001_initial_schema.sql |
| `enforce_customer_key_reservation` | - | yes | `enforce_customer_key_reservation` | `23514` | 0001_initial_schema.sql |
| `enforce_customer_media_debit_capacity` | - | yes | `enforce_customer_media_debit_capacity` | `23514` | 0001_initial_schema.sql |
| `enforce_customer_meter_exclusivity` | - | yes | `exclusive_customer_media_meter`, `exclusive_customer_text_meter` | `23514` | 0388_customer_unit_media_billing.sql |
| `enforce_customer_unit_spending_limits` | - | yes | `enforce_customer_unit_spending_limits` | `23514` | 0386_customer_unit_spending_limits.sql |
| `enforce_customer_workspace_reservation` | - | yes | `enforce_customer_workspace_reservation` | `23514` | 0001_initial_schema.sql |
| `enforce_supplier_media_binding` | - | yes | `supplier_earning_meter`, `supplier_media_binding` | `23514` | 0001_initial_schema.sql |
| `guard_asset_image_ingestion_claim` | - | yes | `immutable_asset_image_ingestion_claim` | `P0001` | 0001_initial_schema.sql |
| `guard_platform_media_liability_dispatch` | - | yes | `guard_platform_media_liability_dispatch` | `P0007` | 0388_customer_unit_media_billing.sql |
| `guard_topup_terminal_state` | - | yes | `guard_customer_topup_closure`, `guard_customer_topup_settlement` | `P0001` | 0001_initial_schema.sql |
| `initialize_vendor_request_rate` | - | yes | `initialize_vendor_request_rate` | - | 0001_initial_schema.sql |
| `lock_media_status_attempt` | - | yes | `lock_media_status_attempt` | - | 0001_initial_schema.sql |
| `maintain_customer_account_posted_balance` | - | yes | `a00_maintain_customer_account_posted_balance_on_entry` | - | 0001_initial_schema.sql |
| `mark_asset_image_ingestion_claim_resolved` | - | yes | `resolve_asset_image_ingestion_claim` | - | 0001_initial_schema.sql |
| `niu_admit_unpriced_gateway_batch` | operation_ids uuid[], attempt_ids uuid[], organization_ids uuid[], project_ids uuid[], key_ids uuid[], model_aliases text[], task_ids text[], revisions text[] | no | - | `22023` | 0001_initial_schema.sql |
| `niu_admit_unpriced_gateway_batch_with_route` | operation_ids uuid[], attempt_ids uuid[], organization_ids uuid[], project_ids uuid[], key_ids uuid[], model_aliases text[], task_ids text[], revisions text[], upstream_models text[], api_bases text[] | no | - | `22023` | 0001_initial_schema.sql |
| `niu_admit_unpriced_gateway_batch_with_route` | operation_ids uuid[], attempt_ids uuid[], organization_ids uuid[], project_ids uuid[], key_ids uuid[], model_aliases text[], task_ids text[], revisions text[], upstream_models text[], api_bases text[], dispatch_providers text[] | no | - | `22023` | 0001_initial_schema.sql |
| `niu_authorized_encryption_rewrap` | relation_name text, cipher_column text, old_record jsonb, new_record jsonb | no | - | - | 0001_initial_schema.sql |
| `niu_available_key_slug` | workspace uuid, key_name text | no | - | - | 0001_initial_schema.sql |
| `niu_available_organization_slug` | organization_name text | no | - | - | 0405_organization_slugs.sql |
| `niu_available_pool_slug` | pool_name text, current_alias text | no | - | - | 0390_model_route_pool_rules.sql |
| `niu_available_provider_slug` | provider_name text | no | - | - | 0001_initial_schema.sql |
| `niu_available_workspace_slug` | workspace_name text | no | - | - | 0001_initial_schema.sql |
| `niu_check_dispatch_model_guardrails` | - | yes | `dispatch_requires_current_model_guardrails` | `P0010` | 0001_initial_schema.sql |
| `niu_check_input_detector_bindings` | - | yes | - | `P0010` | 0001_initial_schema.sql |
| `niu_check_inspected_guardrail_binding` | - | yes | `zy_check_inspected_guardrail_binding` | `P0006`, `P0010` | 0001_initial_schema.sql |
| `niu_check_unqualified_image_requirements` | - | yes | - | `P0010` | 0001_initial_schema.sql |
| `niu_clear_ingested_image_readiness_pending` | - | yes | `clear_ingested_image_readiness_pending` | - | 0001_initial_schema.sql |
| `niu_commercial_offer_personal_guard` | - | yes | `commercial_offer_personal_guard` | `P0008` | 0422_offer_authorization_personal_guard.sql |
| `niu_credit_range_backing` | lot_atoms bigint, backing_nanos bigint, start_atom bigint, end_atom bigint | no | - | - | 0387_customer_unit_purchase_reversals.sql |
| `niu_customer_account_outstanding` | p_account uuid, p_exclude_attempt uuid | no | - | - | 0001_initial_schema.sql |
| `niu_customer_attempt_spending_root` | p_attempt uuid | no | - | - | 0001_initial_schema.sql |
| `niu_customer_credit_account_covered` | account uuid, ignore_entry uuid | no | - | - | 0001_initial_schema.sql |
| `niu_customer_credit_source_split` | entry uuid | no | - | `23514` | 0001_initial_schema.sql |
| `niu_customer_discount_valid` | baseline uuid, model text, currency_code text, rates jsonb | no | - | - | 0001_initial_schema.sql |
| `niu_customer_explicit_gift_pool` | account uuid | no | - | - | 0001_initial_schema.sql |
| `niu_customer_key_committed` | p_root uuid, p_account uuid | no | - | - | 0001_initial_schema.sql |
| `niu_customer_late_refund_quantity` | refund uuid | no | - | - | 0001_initial_schema.sql |
| `niu_customer_unit_key_committed` | p_organization uuid, p_project uuid, p_root uuid, p_exclude_attempt uuid | no | - | - | 0388_customer_unit_media_billing.sql |
| `niu_customer_unit_media_bound` | price jsonb, quantity jsonb | no | - | - | 0388_customer_unit_media_billing.sql |
| `niu_customer_unit_mode_preview` | text | no | - | - | 0388_customer_unit_media_billing.sql |
| `niu_customer_unit_text_bound` | price jsonb, input_tokens bigint, output_tokens bigint | no | - | - | 0001_initial_schema.sql |
| `niu_customer_unit_workspace_committed` | p_organization uuid, p_project uuid, p_exclude_attempt uuid | no | - | - | 0388_customer_unit_media_billing.sql |
| `niu_customer_unpaid_credit` | charge uuid | no | - | - | 0001_initial_schema.sql |
| `niu_customer_verified_prepaid_cash` | account uuid | no | - | - | 0001_initial_schema.sql |
| `niu_customer_workspace_committed` | p_organization uuid, p_project uuid, p_account uuid | no | - | - | 0001_initial_schema.sql |
| `niu_enforce_key_concurrency` | - | yes | `enforce_key_concurrency` | `P0021` | 0001_initial_schema.sql |
| `niu_enforce_key_request_rate` | - | yes | `enforce_key_request_rate` | `P0020`, `P0026` | 0001_initial_schema.sql |
| `niu_enforce_key_token_rate` | - | yes | `enforce_key_token_rate` | `P0022`, `P0023` | 0001_initial_schema.sql |
| `niu_enforce_vendor_request_rate` | - | yes | `enforce_vendor_request_rate` | `P0024`, `P0025`, `P0027` | 0001_initial_schema.sql |
| `niu_guard_dispatch_provider_snapshot` | - | yes | `immutable_dispatch_provider_snapshot` | `P0006` | 0001_initial_schema.sql |
| `niu_guard_media_offer_dispatch` | - | yes | `media_offer_requires_media_dispatch` | `P0007` | 0388_customer_unit_media_billing.sql |
| `niu_guard_provider_offer_activation` | - | yes | `provider_offer_activation_requires_qualification` | `P0007` | 0001_initial_schema.sql |
| `niu_guard_provider_offer_binding` | - | yes | `provider_offer_binding_requires_qualification` | `P0007` | 0001_initial_schema.sql |
| `niu_guard_qualified_supplier_dispatch` | - | yes | `attempts_require_current_supplier_qualification` | `P0007` | 0409_offer_authorization_admission.sql |
| `niu_guardrail_rejection_detail` | org uuid, workspace uuid, key uuid, reason text | no | - | - | 0001_initial_schema.sql |
| `niu_initial_workspace_route_slug` | workspace_name text, workspace_id uuid | no | - | - | 0001_initial_schema.sql |
| `niu_invalidate_offer_authorization_on_revision` | - | yes | `offer_revision_invalidates_authorization` | - | 0408_offer_authorization_invalidation.sql |
| `niu_invalidate_supplier_model_qualification` | - | yes | `supplier_model_requires_new_review` | - | 0408_offer_authorization_invalidation.sql |
| `niu_invalidate_supplier_route_qualification` | - | yes | `supplier_configuration_requires_new_review` | - | 0408_offer_authorization_invalidation.sql |
| `niu_key_token_budget` | root uuid, excluded uuid, as_of timestamp with time zone | no | - | - | 0001_initial_schema.sql |
| `niu_lock_customer_unit_mode_change` | - | no | - | - | 0388_customer_unit_media_billing.sql |
| `niu_mark_dispatched_with_guardrail_audit` | uuid, uuid, uuid, uuid | no | - | - | 0001_initial_schema.sql |
| `niu_mark_dispatched_with_guardrail_audit` | uuid, uuid, uuid, uuid, boolean | no | - | - | 0001_initial_schema.sql |
| `niu_media_liability_identity_valid` | identity jsonb | no | - | - | 0001_initial_schema.sql |
| `niu_media_liability_quantity_valid` | quantity jsonb | no | - | - | 0001_initial_schema.sql |
| `niu_media_offer_binding_current` | p_provider uuid, p_offer uuid, p_revision uuid | no | - | - | 0001_initial_schema.sql |
| `niu_model_rule_permits` | rule jsonb, model text | no | - | - | 0001_initial_schema.sql |
| `niu_offer_qualification_current` | p_provider uuid, p_offer uuid, p_revision uuid | no | - | - | 0409_offer_authorization_admission.sql |
| `niu_offer_review_personal_guard` | - | yes | `offer_review_personal_guard` | `P0008` | 0001_initial_schema.sql |
| `niu_personal_vendor_owner_guard` | - | yes | `personal_vendor_owner_guard` | `P0008` | 0422_offer_authorization_personal_guard.sql |
| `niu_pin_supplier_attempt_review` | - | yes | `pin_supplier_attempt_review` | `P0007` | 0409_offer_authorization_admission.sql |
| `niu_platform_currency_immutable` | - | yes | `platform_currency_immutable`, `platform_currency_no_truncate` | `23514` | 0001_initial_schema.sql |
| `niu_purge_asset_content_page` | content_kind text | no | - | `22023` | 0001_initial_schema.sql |
| `niu_purge_asset_group_request_page` | - | no | - | - | 0001_initial_schema.sql |
| `niu_purge_inspected_image_page` | - | no | - | - | 0001_initial_schema.sql |
| `niu_purge_media_result_page` | - | no | - | - | 0001_initial_schema.sql |
| `niu_purge_request_payload_page` | - | no | - | - | 0001_initial_schema.sql |
| `niu_purge_workspace_provider_verification_page` | - | no | - | - | 0001_initial_schema.sql |
| `niu_record_connection_incident` | p_attempt uuid | no | - | - | 0416_repeated_connection_failures.sql |
| `niu_record_dispatch_guardrails` | - | yes | - | - | 0001_initial_schema.sql |
| `niu_record_incident_workspace` | - | yes | `incident_workspace_observed` | - | 0417_incident_workspace_events.sql |
| `niu_record_qualified_connection_incident` | p_attempt uuid | no | - | - | dynamic |
| `niu_record_vendor_safe_failure` | failed_attempt uuid | no | - | - | 0001_initial_schema.sql |
| `niu_require_input_inspection_result` | - | yes | - | `P0006` | 0001_initial_schema.sql |
| `niu_require_platform_currency` | - | yes | `platform_currency_guard` | `P0001` | 0001_initial_schema.sql |
| `niu_require_registry_publication` | - | yes | `registry_publication_model_route_pools`, `registry_publication_personal_vendor_ownership`, `registry_publication_provider_offer_authorization_revocations`, `registry_publication_provider_offer_authorizations`, `registry_publication_provider_offer_qualification_reviews`, `registry_publication_provider_offers`, `registry_publication_provider_qualification_reviews`, `registry_publication_provider_qualification_revocations`, `registry_publication_supplier_review`, `registry_publication_vendor_models`, `registry_publication_vendor_supplier_ownership`, `registry_publication_vendors` | `P0029` | 0001_initial_schema.sql |
| `niu_require_registry_writer` | - | yes | `registry_writer_model_route_pools`, `registry_writer_personal_vendor_ownership`, `registry_writer_provider_offer_authorization_revocations`, `registry_writer_provider_offer_authorizations`, `registry_writer_provider_offer_qualification_reviews`, `registry_writer_provider_offers`, `registry_writer_provider_qualification_reviews`, `registry_writer_provider_qualification_revocations`, `registry_writer_supplier_review`, `registry_writer_vendor_models`, `registry_writer_vendor_supplier_ownership`, `registry_writer_vendors` | `P0029` | 0001_initial_schema.sql |
| `niu_reserve_and_dispatch_gateway` | p_organization_id uuid, p_project_id uuid, p_key_id uuid, p_attempt_id uuid, p_price_revision_id uuid, p_resource_id text, p_offer_revision text, p_prompt_bound bigint, p_completion_bound bigint | no | - | `P0005`, `P0006`, `P0007`, `P0009`, `P0039` | 0001_initial_schema.sql |
| `niu_reserve_and_dispatch_gateway_audited` | p_organization_id uuid, p_project_id uuid, p_key_id uuid, p_attempt_id uuid, p_price_revision_id uuid, p_resource_id text, p_offer_revision text, p_prompt_bound bigint, p_completion_bound bigint | no | - | - | 0001_initial_schema.sql |
| `niu_reserve_and_dispatch_gateway_audited` | p_organization_id uuid, p_project_id uuid, p_key_id uuid, p_attempt_id uuid, p_price_revision_id uuid, p_resource_id text, p_offer_revision text, p_prompt_bound bigint, p_completion_bound bigint, p_audit_rate_denial boolean | no | - | - | 0001_initial_schema.sql |
| `niu_resolve_connection_incidents` | p_attempt uuid | no | - | - | 0415_incident_mapping_serialization.sql |
| `niu_resolve_connection_incidents_on_evidence` | - | yes | `connection_incident_execution_recovery`, `connection_incident_timing_recovery` | - | 0413_connection_incidents.sql |
| `niu_retail_discount_valid` | original jsonb, result jsonb | no | - | - | 0001_initial_schema.sql |
| `niu_serialize_vendor_credential_update` | - | yes | `serialize_vendor_credential_update` | - | 0001_initial_schema.sql |
| `niu_submission_key_digest` | p_key uuid | no | - | - | 0001_initial_schema.sql |
| `niu_supplier_model_route_available` | p_alias text | no | - | - | 0001_initial_schema.sql |
| `niu_supplier_qualification_current` | p_provider uuid | no | - | - | 0001_initial_schema.sql |
| `niu_sync_chat_session_payload_metadata` | - | yes | `sync_chat_session_payload_metadata` | - | 0001_initial_schema.sql |
| `niu_track_ingested_image_readiness_pending` | - | yes | `track_ingested_image_readiness_pending` | - | 0001_initial_schema.sql |
| `niu_verify_customer_account_posted_balance` | p_account uuid | no | - | - | 0001_initial_schema.sql |
| `preserve_asset_group_intent` | - | yes | `asset_group_intent_transitions` | `P0001` | 0001_initial_schema.sql |
| `preserve_asset_group_read_result` | - | yes | `immutable_asset_group_read_result` | `23514` | 0001_initial_schema.sql |
| `preserve_asset_group_request_deletion` | - | yes | `asset_group_request_deletion_immutable` | `P0001` | 0001_initial_schema.sql |
| `preserve_asset_group_update_patch` | - | yes | `immutable_asset_group_update_patch` | `23514` | 0001_initial_schema.sql |
| `preserve_asset_listing_result` | - | yes | `immutable_asset_listing_result` | `23514` | 0001_initial_schema.sql |
| `preserve_asset_lookup_result` | - | yes | `immutable_asset_lookup_result` | `23514` | 0001_initial_schema.sql |
| `preserve_asset_management_credential_revision` | - | yes | `immutable_asset_management_credential_revision` | `23514` | 0001_initial_schema.sql |
| `preserve_asset_management_revocation` | - | yes | `immutable_asset_management_erasure`, `immutable_asset_management_revocation` | `23514` | 0001_initial_schema.sql |
| `preserve_asset_operation_authorization` | - | yes | `immutable_asset_group_deletion_claim`, `immutable_asset_group_deletion_consent`, `immutable_asset_group_deletion_consent_revocation`, `immutable_asset_group_deletion_outcome`, `immutable_asset_group_dispatch_authorization`, `immutable_asset_group_dispatch_outcome`, `immutable_asset_group_read_claim`, `immutable_asset_group_read_outcome`, `immutable_asset_group_read_result_deletion`, `immutable_asset_group_update_claim`, `immutable_asset_group_update_intent`, `immutable_asset_group_update_outcome`, `immutable_asset_group_update_read`, `immutable_asset_group_update_reconciliation`, `immutable_asset_listing_claim`, `immutable_asset_listing_outcome`, `immutable_asset_listing_result_deletion`, `immutable_asset_lookup_claim`, `immutable_asset_lookup_outcome`, `immutable_asset_lookup_result_deletion`, `immutable_asset_operation_authorization`, `immutable_asset_operation_authorization_revocation`, `immutable_branding_configuration_event` | `23514` | 0001_initial_schema.sql |
| `preserve_attempt_public_reference` | - | yes | `preserve_attempt_public_reference` | `P0001` | 0001_initial_schema.sql |
| `preserve_chat_public_reference` | - | yes | `preserve_chat_public_reference` | `P0001` | 0001_initial_schema.sql |
| `preserve_encryption_rotation_operation` | - | yes | `immutable_encryption_rotation_operation` | `23514` | 0001_initial_schema.sql |
| `preserve_generation_capture_identity` | - | yes | `preserve_generation_capture_identity` | `P0001` | 0001_initial_schema.sql |
| `preserve_inspected_image_envelope` | - | yes | - | `23514` | 0001_initial_schema.sql |
| `preserve_key_slug` | - | yes | `immutable_key_slug` | `23514` | 0001_initial_schema.sql |
| `preserve_organization_slug` | - | yes | `immutable_organization_slug` | `23505`, `23514` | 0405_organization_slugs.sql |
| `preserve_provider_slug` | - | yes | `immutable_provider_slug` | `23514` | 0001_initial_schema.sql |
| `preserve_request_failure` | - | yes | `preserve_request_failure` | `P0008` | 0001_initial_schema.sql |
| `preserve_video_input_public_reference` | - | yes | `preserve_video_input_public_reference` | `P0001` | 0001_initial_schema.sql |
| `preserve_video_session_public_reference` | - | yes | `preserve_video_session_public_reference` | `P0001` | 0001_initial_schema.sql |
| `preserve_workspace_asset_bytes` | - | yes | `immutable_workspace_asset_bytes` | `23514` | 0001_initial_schema.sql |
| `preserve_workspace_asset_identity` | - | yes | `immutable_workspace_asset_identity` | `23514` | 0001_initial_schema.sql |
| `preserve_workspace_provider_asset_identity` | - | yes | `preserve_workspace_provider_asset`, `preserve_workspace_provider_group` | `23514` | 0001_initial_schema.sql |
| `preserve_workspace_provider_operation` | - | yes | `preserve_workspace_provider_operation` | `23514` | 0001_initial_schema.sql |
| `preserve_workspace_provider_verification` | - | yes | `preserve_workspace_provider_verification` | `23514` | 0001_initial_schema.sql |
| `preserve_workspace_route_slug` | - | yes | `immutable_workspace_route_slug` | `23505`, `23514` | 0405_organization_slugs.sql |
| `protect_customer_account_posted_balance` | - | yes | `guard_customer_account_posted_balance` | `23514` | 0001_initial_schema.sql |
| `protect_customer_balance_reservation` | - | yes | `protect_customer_balance_reservation` | `P0001` | 0001_initial_schema.sql |
| `protect_customer_discount_revision` | - | yes | `validate_customer_discount_revision` | `23514` | 0001_initial_schema.sql |
| `protect_customer_key_limit` | - | yes | `protect_customer_key_limit` | `23514`, `P0001` | 0001_initial_schema.sql |
| `protect_customer_unit_key_limit` | - | yes | `protect_customer_unit_key_limit` | `23514` | 0386_customer_unit_spending_limits.sql |
| `protect_customer_unit_workspace_limit` | - | yes | `protect_customer_unit_workspace_limit` | `23514` | 0386_customer_unit_spending_limits.sql |
| `protect_customer_workspace_limit` | - | yes | `protect_customer_workspace_limit` | `23514`, `P0001` | 0001_initial_schema.sql |
| `protect_key_spending_identity` | - | yes | `protect_key_spending_identity` | `23514` | 0001_initial_schema.sql |
| `protect_managed_attempt_route` | - | yes | `protect_managed_attempt_route` | `P0024` | 0001_initial_schema.sql |
| `protect_media_liability_head` | - | yes | `protect_media_liability_head` | `23514` | 0001_initial_schema.sql |
| `protect_media_result_reference` | - | yes | `protect_media_result_reference` | `P0001` | 0001_initial_schema.sql |
| `protect_model_route_pool` | - | yes | `protect_model_route_pool` | `P0024` | 0390_model_route_pool_rules.sql |
| `protect_model_route_pool_history` | - | yes | `protect_model_route_pool_history` | `P0024` | 0001_initial_schema.sql |
| `protect_platform_retail_price_head` | - | yes | `protect_platform_retail_price_head` | `23514` | 0001_initial_schema.sql |
| `protect_retail_media_enrollment` | - | yes | `protect_retail_media_enrollment` | `23514` | 0001_initial_schema.sql |
| `protect_retail_text_enrollment` | - | yes | `protect_retail_text_enrollment` | `23514` | 0001_initial_schema.sql |
| `protect_retained_video_composer_draft` | - | yes | `protect_retained_video_composer_draft` | `23503` | 0001_initial_schema.sql |
| `protect_video_submission_intent` | - | yes | `protect_video_submission_intent` | `P0001` | 0001_initial_schema.sql |
| `recheck_managed_attempt_route` | - | yes | `recheck_managed_attempt_route` | `P0024` | 0423_vendor_internal_access_scope.sql |
| `record_customer_workspace_limit_revision` | - | yes | `record_customer_workspace_limit_revision` | `23514` | 0001_initial_schema.sql |
| `register_customer_payment_reference` | - | yes | `register_customer_payment_reference`, `register_customer_unit_payment_reference` | `23514` | 0001_initial_schema.sql |
| `reject_accounting_mutation` | - | yes | `immutable_account_organization_creation_receipts`, `immutable_admin_mode_events`, `immutable_asset_image_ingestion_consent`, `immutable_asset_image_ingestion_consent_revocation`, `immutable_asset_image_ingestion_outcome`, `immutable_asset_image_source_access`, `immutable_asset_image_source_delivery`, `immutable_attempt_route_generations`, `immutable_batch_guardrail_rejection`, `immutable_company_creation_receipt`, `immutable_cost`, `immutable_customer_audit`, `immutable_customer_balance_binding`, `immutable_customer_balance_consumption_allocation`, `immutable_customer_balance_entry`, `immutable_customer_balance_grant`, `immutable_customer_balance_grant_correction`, `immutable_customer_balance_policy`, `immutable_customer_binding`, `immutable_customer_charge`, `immutable_customer_credit_policy_event`, `immutable_customer_credit_repayment`, `immutable_customer_credit_source`, `immutable_customer_funding_receipt`, `immutable_customer_grant_credit_application`, `immutable_customer_grant_credit_restoration`, `immutable_customer_grant_policy`, `immutable_customer_invoice`, `immutable_customer_invoice_entry`, `immutable_customer_key_limit_history`, `immutable_customer_media_charge`, `immutable_customer_media_liability`, `immutable_customer_media_pricing`, `immutable_customer_media_rate_cards`, `immutable_customer_media_rate_retirements`, `immutable_customer_media_usage`, `immutable_customer_operation_tariff`, `immutable_customer_payment`, `immutable_customer_payment_reference`, `immutable_customer_tariff`, `immutable_customer_topup_checkout`, `immutable_customer_topup_closure`, `immutable_customer_topup_creation_claim`, `immutable_customer_topup_notification`, `immutable_customer_topup_order`, `immutable_customer_topup_provider_order`, `immutable_customer_topup_settlement`, `immutable_customer_unit_attempt_tariff`, `immutable_customer_unit_definition`, `immutable_customer_unit_extension`, `immutable_customer_unit_key_limit_history`, `immutable_customer_unit_media_attempt_tariff`, `immutable_customer_unit_media_charge`, `immutable_customer_unit_media_tariff`, `immutable_customer_unit_mode_change`, `immutable_customer_unit_mode_preview`, `immutable_customer_unit_operation_tariff`, `immutable_customer_unit_purchase_lot`, `immutable_customer_unit_purchase_reversal`, `immutable_customer_unit_purchase_reversal_range`, `immutable_customer_unit_purchase_rule`, `immutable_customer_unit_quote`, `immutable_customer_unit_receipt`, `immutable_customer_unit_reservation`, `immutable_customer_unit_reserved_range`, `immutable_customer_unit_resolution`, `immutable_customer_unit_restoration`, `immutable_customer_unit_text_charge`, `immutable_customer_unit_text_tariff`, `immutable_customer_unit_topup`, `immutable_customer_unit_workspace_limit_history`, `immutable_customer_workspace_limit_history`, `immutable_dispatch_guardrail_decision`, `immutable_dispatch_guardrail_rejection`, `immutable_encryption_rewrap_authorization`, `immutable_evaluation_attempt_binding`, `immutable_gateway_admission_denial`, `immutable_gateway_retry_attempt`, `immutable_gateway_retry_policy`, `immutable_generations_task_association`, `immutable_generations_turn_intent`, `immutable_guardrail_preparation_denial`, `immutable_image_processing_approval`, `immutable_image_request`, `immutable_image_request_approval`, `immutable_ingested_image_readiness_claim`, `immutable_ingested_image_readiness_outcome`, `immutable_ingested_video_reference`, `immutable_input_detector_decision`, `immutable_inspected_guardrail_binding`, `immutable_inspected_image_source`, `immutable_inspected_image_source_approvals`, `immutable_inspected_image_source_bytes`, `immutable_inspected_image_source_erasure`, `immutable_key_attempt_token_bounds`, `immutable_key_audit`, `immutable_key_concurrency_history`, `immutable_key_guardrail_assignment_event`, `immutable_key_ip_policy_history`, `immutable_key_request_rate_history`, `immutable_key_token_rate_history`, `immutable_media_job_binding`, `immutable_media_job_observation`, `immutable_media_liability_change`, `immutable_media_liability_qualification`, `immutable_media_liability_revocation`, `immutable_media_output_snapshot`, `immutable_media_processing_approval`, `immutable_media_query_evidence`, `immutable_media_recovery_protocols`, `immutable_media_recovery_route`, `immutable_media_request_approval_binding`, `immutable_media_request_binding`, `immutable_media_submission_keys`, `immutable_media_submission_uncertainty`, `immutable_media_transport_timing`, `immutable_media_upstream_job_claim`, `immutable_member_invitation_events`, `immutable_openrouter_generation_reference`, `immutable_openrouter_usage_reconciliation`, `immutable_operation_funding_source`, `immutable_operator_audit`, `immutable_operator_creation_receipt`, `immutable_output_guardrail_decision`, `immutable_output_guardrail_observation`, `immutable_payment_callback_verification`, `immutable_payment_checkout_verification`, `immutable_payment_gateway_configuration_events`, `immutable_payment_signed_notifications`, `immutable_platform_admin_events`, `immutable_platform_retail_change`, `immutable_platform_retail_promotion`, `immutable_platform_retail_retirement`, `immutable_platform_retail_standard`, `immutable_prepared_customer_balance_grant`, `immutable_price`, `immutable_provider_audit`, `immutable_provider_binding`, `immutable_provider_earning`, `immutable_provider_offer_authorization`, `immutable_provider_offer_authorization_revocation`, `immutable_provider_offer_qualification_review`, `immutable_provider_price_evidence`, `immutable_provider_qualification_review`, `immutable_provider_qualification_revocation`, `immutable_provider_rate`, `immutable_provider_settlement`, `immutable_provider_settlement_entry`, `immutable_quota_updates`, `immutable_retail_media_attempt_price`, `immutable_retail_media_enrollment_change`, `immutable_retail_text_enrollment_change`, `immutable_retail_text_materialization`, `immutable_retail_text_operation_price`, `immutable_routing_registry_generations`, `immutable_supplier_media_cards`, `immutable_supplier_media_pricing`, `immutable_supplier_media_retirement`, `immutable_vendor_audit_events`, `immutable_vendor_request_rate_history`, `immutable_workspace_asset_event`, `immutable_workspace_asset_video_binding`, `immutable_workspace_creation_receipt`, `immutable_workspace_evaluation_history`, `immutable_workspace_evaluation_run`, `immutable_workspace_event`, `immutable_workspace_event_subscription_history`, `immutable_workspace_pool_history`, `preserve_generation_capture_history`, `preserve_procurement_configuration_events`, `retain_media_result_tombstone`, `retain_video_submission_intent` | `P0001` | 0001_initial_schema.sql |
| `reject_personal_attempt_accounting` | - | yes | `a_personal_customer_balance`, `a_personal_customer_tariff`, `a_personal_supplier_offer` | `P0008` | 0001_initial_schema.sql |
| `require_adapter_checkout_url` | - | yes | `adapter_checkout_url` | `P0001` | 0001_initial_schema.sql |
| `require_checkout_payment_identity` | - | yes | `require_checkout_payment_identity` | `P0001` | 0001_initial_schema.sql |
| `require_current_ingested_video_deadline` | - | yes | `require_current_ingested_video_deadline` | `P0001` | 0001_initial_schema.sql |
| `require_current_media_dispatch_route` | - | yes | `require_current_media_dispatch_route` | `23514` | 0001_initial_schema.sql |
| `require_customer_balance_dispatch` | - | yes | `require_customer_balance_dispatch` | `P0009`, `P0011` | 0423_vendor_internal_access_scope.sql |
| `require_customer_issuance_mode` | - | yes | `require_customer_money_funding_mode`, `require_customer_money_grant_mode`, `require_customer_unit_issuance_mode` | `23514` | 0384_customer_unit_mode_changes.sql |
| `require_dispatched_media_uncertainty` | - | yes | `require_dispatched_media_timing`, `require_dispatched_media_uncertainty` | `23514` | 0001_initial_schema.sql |
| `require_live_workspace_asset_content` | - | yes | `require_live_workspace_asset_content` | `23514` | 0001_initial_schema.sql |
| `require_media_completion_evidence` | - | yes | `require_media_completion_evidence` | `23514` | 0001_initial_schema.sql |
| `require_media_job_recovery_route` | - | yes | `require_media_job_recovery_route` | `23514` | 0001_initial_schema.sql |
| `require_media_output_before_dispatch` | - | yes | `require_media_output_before_dispatch` | `P0001` | 0001_initial_schema.sql |
| `require_media_recovery_protocol` | - | yes | `require_media_recovery_protocol` | `P0008` | 0001_initial_schema.sql |
| `require_prepared_image_request` | - | yes | `require_prepared_image_request` | `P0001` | 0001_initial_schema.sql |
| `require_prepared_ingested_video_reference` | - | yes | `require_prepared_ingested_video_reference` | `P0001` | 0001_initial_schema.sql |
| `require_prepared_media_request` | - | yes | `require_prepared_media_request` | `23514` | 0001_initial_schema.sql |
| `require_prepared_workspace_asset_video` | - | yes | `require_prepared_workspace_asset_video` | `23514` | 0001_initial_schema.sql |
| `require_scoped_image_approval` | - | yes | `require_scoped_image_approval` | `P0001` | 0001_initial_schema.sql |
| `require_scoped_media_request_approval` | - | yes | `require_scoped_media_request_approval` | `23514` | 0001_initial_schema.sql |
| `require_unsent_media_output_snapshot` | - | yes | `require_unsent_media_output_snapshot` | `P0001` | 0001_initial_schema.sql |
| `separate_personal_media_accounting` | - | yes | `separate_personal_media_pricing`, `zz_separate_media_personal_route` | `23514` | 0388_customer_unit_media_billing.sql |
| `set_inspected_image_source_content_expiry` | - | yes | `set_inspected_image_source_content_expiry` | - | 0001_initial_schema.sql |
| `validate_customer_balance_consumption_allocation` | - | yes | `validate_customer_balance_consumption_allocation` | `23514` | 0001_initial_schema.sql |
| `validate_customer_balance_grant` | - | yes | `validate_customer_balance_grant` | `23514` | 0001_initial_schema.sql |
| `validate_customer_charge_ledger_source` | - | yes | `validate_customer_charge_ledger_source` | `23514` | 0001_initial_schema.sql |
| `validate_customer_credit_policy_event` | - | yes | `validate_customer_credit_policy_event` | `23514` | 0001_initial_schema.sql |
| `validate_customer_credit_repayment` | - | yes | `validate_customer_credit_repayment` | `23514` | 0001_initial_schema.sql |
| `validate_customer_credit_source` | - | yes | `validate_customer_credit_source` | `23514` | 0001_initial_schema.sql |
| `validate_customer_grant_credit_application` | - | yes | `validate_customer_grant_credit_application` | `23514` | 0001_initial_schema.sql |
| `validate_customer_grant_credit_restoration` | - | yes | `validate_customer_grant_credit_restoration` | `23514` | 0001_initial_schema.sql |
| `validate_customer_grant_policy` | - | yes | `validate_customer_grant_policy` | `23514` | 0001_initial_schema.sql |
| `validate_customer_invoice_charge_source` | - | yes | `validate_customer_invoice_charge_source` | `23514` | 0001_initial_schema.sql |
| `validate_customer_media_rate_retirement` | - | yes | `valid_customer_media_rate_retirement` | `23514` | 0001_initial_schema.sql |
| `validate_customer_media_usage_observation` | - | yes | `validate_customer_media_usage_observation` | `23503` | 0388_customer_unit_media_billing.sql |
| `validate_customer_unit_extension` | - | yes | `validate_customer_unit_extension` | `23514` | 0388_customer_unit_media_billing.sql |
| `validate_customer_unit_media_attempt_tariff` | - | yes | `validate_customer_unit_media_attempt_tariff` | `23514` | 0388_customer_unit_media_billing.sql |
| `validate_customer_unit_mode_change` | - | yes | `validate_customer_unit_mode_change` | `23514` | 0384_customer_unit_mode_changes.sql |
| `validate_customer_unit_purchase_lot` | - | yes | `validate_customer_unit_purchase_lot` | `23514` | 0001_initial_schema.sql |
| `validate_customer_unit_purchase_reversal` | - | yes | `validate_customer_unit_purchase_reversal` | `23514` | 0387_customer_unit_purchase_reversals.sql |
| `validate_customer_unit_purchase_reversal_range` | - | yes | `validate_customer_unit_purchase_reversal_range` | `23514` | 0387_customer_unit_purchase_reversals.sql |
| `validate_customer_unit_purchase_reversal_total` | - | yes | `customer_unit_purchase_reversal_range_total`, `customer_unit_purchase_reversal_total` | `23514` | 0387_customer_unit_purchase_reversals.sql |
| `validate_customer_unit_quote` | - | yes | `validate_customer_unit_quote` | `23514` | 0001_initial_schema.sql |
| `validate_customer_unit_range` | - | yes | `validate_customer_unit_range` | `23514` | 0001_initial_schema.sql |
| `validate_customer_unit_reservation_total` | - | yes | `customer_unit_extension_total`, `customer_unit_range_total`, `customer_unit_reservation_total` | `23514` | 0001_initial_schema.sql |
| `validate_customer_unit_resolution` | - | yes | `validate_customer_unit_resolution` | `23514` | 0001_initial_schema.sql |
| `validate_customer_unit_restoration` | - | yes | `validate_customer_unit_restoration` | `23514` | 0001_initial_schema.sql |
| `validate_customer_unit_settlement` | - | yes | `validate_customer_unit_receipt`, `validate_customer_unit_settlement` | `23514` | 0001_initial_schema.sql |
| `validate_customer_unit_tariff_binding` | - | yes | `validate_customer_unit_attempt_tariff`, `validate_customer_unit_operation_tariff` | `23514` | 0390_model_route_pool_rules.sql |
| `validate_customer_unit_topup` | - | yes | `validate_customer_unit_topup` | `23514` | 0001_initial_schema.sql |
| `validate_media_liability_qualification` | - | yes | `validate_media_liability_qualification`, `validate_media_liability_revocation` | `23514` | 0001_initial_schema.sql |
| `validate_media_recovery_protocol` | - | yes | `validate_media_recovery_protocol` | `P0008` | 0001_initial_schema.sql |
| `validate_personal_attempt_route` | - | yes | `validate_personal_attempt_route` | `P0008` | 0423_vendor_internal_access_scope.sql |
| `validate_platform_retail_revision` | - | yes | `validate_platform_retail_promotion`, `validate_platform_retail_retirement`, `validate_platform_retail_standard` | `23514` | 0001_initial_schema.sql |
| `validate_prepared_customer_balance_grant_match` | - | yes | `validate_customer_balance_grant_preparation`, `validate_prepared_customer_balance_grant_match` | `23514` | 0001_initial_schema.sql |
| `validate_retail_media_attempt_price` | - | yes | `validate_retail_media_attempt_price` | `23514` | 0001_initial_schema.sql |
| `validate_retail_text_materialization` | - | yes | `validate_retail_text_materialization` | `23514` | 0001_initial_schema.sql |
| `validate_retail_text_operation_price` | - | yes | `validate_retail_text_operation_price` | `23514` | 0390_model_route_pool_rules.sql |
| `validate_supplier_media_rate_retirement` | - | yes | `valid_supplier_media_retirement` | `23514` | 0001_initial_schema.sql |
| `validate_unused_customer_gift_correction` | - | yes | `validate_unused_customer_gift_correction` | `P0040` | 0001_initial_schema.sql |

## Coverage boundary

Named-test coverage is **17/412 triggers** and **14/19 attempt triggers**. The remainder are inventoried but not claimed as tested. The tests under `crates/storage/tests/trigger_guards.rs` cover the prioritized slice; `docs/reviews/database-trigger-guard-coverage-2026-11-06.md` lists every untested attempt guard with the fixture reason. This document does not claim each of the schema's triggers has a test.
