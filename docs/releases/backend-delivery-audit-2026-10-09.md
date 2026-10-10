# Backend delivery audit and New API comparison

Created: 2026-10-09. Updated: 2026-10-10. Backend work continues on main. This is an open delivery audit,
not release acceptance. Frontend/browser work, container qualification and Agent
Observability are outside this workstream. External merchant activation is not an
internal-readiness gate. Fixture outcomes have no evidentiary weight.

## Current business evidence

| Required area | Current actual evidence | Still unverified or incomplete |
| --- | --- | --- |
| Supplier configuration | [Independent credentials and prices](supplier-workspace-backend-verification-2026-10-09.md); [priced candidate selection, separate expenses and immutable history](../reference/model-route-pools.md); startup now checks unbound/disabled credentials | Full commercial settlement workflow; broader provider coverage; master-key rotation remains unimplemented |
| Workspace API keys | [Granular controls](../product/backend-capability-checklist.md); [credit-backed spending refusal, partial refunds and in-flight rotation](../reference/internal-credit-workflow-live.md); platform grants do not expand customer scope | Mixed-key batch writer, every estimator-overrun path and sustained multi-instance limiter contention |
| Prepaid and accounting | [Actual credit-backed charges, debits, refunds, invoices and reconciliation](../reference/internal-credit-workflow-live.md); [shared-company contention](../reference/company-credit-concurrency-live.md); [nonempty recovery and database fault runs](../reference/financial-backlog-restart-live.md); [payment configuration, checkout and grant lifecycle](../reference/payment-aggregators.md) | Received-cash funding/reversal evidence and complete customer-funded media settlement. Credit-backed evidence is not a received-cash top-up; activation of every merchant is not required |
| Request diagnostics | Actual request detail/CSV and [positive customer-charge reports](../reference/internal-credit-workflow-live.md#customer-reporting-with-actual-positive-charges); [structured-stream failures and disconnect liabilities](../reference/structured-output-streaming.md) | Full protocol/input/error matrix and complete media charge reporting; no overall diagnosis workflow claim |
| Video lifecycle | [Actual generation and result retrieval](video-submission-idempotency-live-2026-10-09.md); [actor-owned intents, response-loss/restart recovery, concurrent status reads and deletion](../reference/video-submission-intents.md) | Customer-funded settlement and broader input/channel coverage. Saved references depend on upstream retention; browser integration remains a separate workstream |
| Performance | [Native list/detail reads](backend-read-performance-2026-10-09.md), [actual priced streams](../reference/priced-text-concurrency-live.md), [one-minute structured streams with ledger checks](../reference/structured-output-streaming.md#one-minute-structured-stream-load-checkpoint) and [mixed-protocol accounting](backend-integration-contract.md#mixed-protocol-concurrent-accounting) | Operational capacity targets, long soak/overload, slow readers, larger actual datasets and broader multi-instance contention |

These are scoped observations. They do not establish parity or superiority over
another gateway. The remaining items must not be replaced by repeated checks of
already exercised read-only paths.

## New API reference baseline

Use upstream source as a capability reference, not as proof of its reliability or
performance. The inspected main commit is
[`1d4328e97417a043a161a0dd30a5b129be3ace49`](https://github.com/QuantumNous/new-api/commit/1d4328e97417a043a161a0dd30a5b129be3ace49).
Its [token model](https://github.com/QuantumNous/new-api/blob/1d4328e97417a043a161a0dd30a5b129be3ace49/model/token.go)
includes independent remaining/used quota, unlimited-quota selection, model
restrictions, expiration, IP restrictions and group selection. At initial review Niu lacked key caps and IP policy. Separate revisioned key-cap
management is now implemented; [actual evidence and limitations](../reference/api-key-spending-limits.md)
remain distinct from complete financial acceptance. [IP policy](../reference/api-key-ip-policies.md)
is also implemented, with actual direct/proxy source checks, rotation continuity
and scoped management verification. [RPM](../reference/api-key-request-rate-limits.md),
[concurrency](../reference/api-key-concurrency-limits.md) and
[estimated token budgets](../reference/api-key-token-rate-limits.md) have their own
implementation boundaries and actual evidence; they are not interchangeable controls.

New API's [project introduction](https://github.com/QuantumNous/new-api-docs-v1/blob/main/content/docs/en/guide/wiki/basic-concepts/project-introduction.mdx)
also describes channel balancing and failover. Its
[task plugin contract](https://github.com/QuantumNous/new-api/blob/1d4328e97417a043a161a0dd30a5b129be3ace49/docs/plugin-api/v1.md)
is a reference for async task and billing behavior. Detailed source review and
comparable current-input measurements remain necessary before any parity claim.
No upstream source is imported by this audit.

The [backend capability checklist](../product/backend-capability-checklist.md)
separates key-level controls and financial layers into observable requirements.

## Remaining delivery work

The following remain open; they are not satisfied by additional key-configuration
round trips or by a green fixture workflow:

1. Close the remaining financial boundaries without repeating settled credit-backed
   paths: received-cash funding and reversal, customer-funded media settlement,
   and unresolved accounting cases outside the recorded recovery runs. Review
   supported callback validation, idempotency and recovery as internal capabilities;
   external merchant activation remains a deployment check. Do not invent a receipt
   to claim payment, and do not require every supported merchant to activate before
   continuing independent backend work.
2. Exercise the remaining mixed-key batch writer and multi-instance limiter
   combinations. [Actual mixed Chat/Responses/embedding accounting](backend-integration-contract.md#mixed-protocol-concurrent-accounting)
   already covers one shared key through four workers. [Shared-company concurrency](../reference/company-credit-concurrency-live.md)
   and [in-flight rotation](../reference/internal-credit-workflow-live.md#key-rotation-during-an-actual-stream)
   cover their specific contention paths. They do not qualify every batch path or
   every estimator overrun; TPM remains an explicit estimate, not an exact tokenizer.
3. Review routing/failover behavior against the pinned reference. A retry that can
   duplicate uncertain paid execution does not qualify as an improvement. Keep
   attempts and customer charges distinguishable and auditable. The
   [generic-path source review](../reference/upstream-retry-policy.md) identifies
   single-route resolution and incomplete business fallback orchestration; the
   shared client's implicit reqwest retry policy is now explicitly disabled.
   [Schema and candidate-policy review](../architecture/model-routing-evolution.md)
   identified the original one-alias/one-credential constraint. Additive
   [text pools](../reference/model-route-pools.md) now separate the customer alias
   from selected mappings and implement revisioned priority/weight policies.
   Actual personal Chat/Responses selection, bounded weighted traffic, and
   customer-priced candidate/revision attribution with distinct configured expenses
   have scoped evidence. Long-run distribution, in-flight candidate changes and
   post-rejection failover remain open.
4. Measure sustained inference/financial contention and larger actual datasets
   against explicit operational capacity targets. Short actual priced/structured-stream runs include independent settlement
   checks, but do not establish production throughput or long-soak limits.
5. Close advertised media-input/channel coverage and commercial video settlement.
   Saved upstream result references still depend on upstream content retention.

## Recent concrete corrections

- Text route pools now preserve customer aliases while selecting separate supply
  mappings. Actual API/database checks cover priority/protocol selection, disabled
  members, pool revision races, scope isolation and concurrent policy updates.

- [Managed route binding](../reference/managed-route-bindings.md) now carries
  selected credential/model revisions to transactional dispatch checks. An actual
  personal Chat configuration race rejected the stale version without dispatch;
  a fresh request completed with independently verified binding and usage.

- Per-key budget identity now survives secret rotation; spending limits, IP,
  RPM, concurrency and estimated TPM have separate management APIs, histories and
  SDK methods, linked from the primary OpenAPI.
- Actual video generation exposed polling that stopped on the revoked original
  key. Recovery now resolves an eligible current key in the same rotation lineage;
  the original saved job completed after the correction without resubmission.
- [Chat output reservations](../reference/chat-output-reservations.md) now use the
  validated request output bound. The request envelope now consistently rejects oversized bodies with HTTP 413
  across capture settings and chunked transport; this is distinct from model input
  estimation and does not qualify arbitrary maximum-sized paid prompts.
- [Financial integer inputs](../reference/billing-integer-inputs.md) reject signed,
  fractional, exponent and overflowing forms before storage. Actual invalid-input
  requests left the ledger unchanged; this does not establish successful payment.
- Token diagnosis separates known usage, retained estimates and historical unknown
  requests without an estimate. Snapshot totals remain null when a complete amount
  cannot be established. Actual Responses and embedding checks supplement Chat;
  broader cross-protocol contention remains open.

No overall release, New API parity or production-capacity claim follows from these
increments. The current scope still excludes frontend/browser work, container
qualification and Agent Observability.
