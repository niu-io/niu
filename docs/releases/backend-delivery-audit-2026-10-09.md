# Backend delivery audit and New API comparison

Created: 2026-10-09. Updated: 2026-10-10. Backend work continues on main. This is an open delivery audit,
not release acceptance. Frontend/browser work, container qualification and Agent
Observability are outside this workstream. External merchant activation is not an
internal-readiness gate. Fixture outcomes have no evidentiary weight.

## Current business evidence

| Required area | Current actual evidence | Still unverified or incomplete |
| --- | --- | --- |
| Supplier configuration | [Independent credentials, scoped routes and price revision concurrency](supplier-workspace-backend-verification-2026-10-09.md) | Complete commercial purchase/selling/settlement journey; broader provider coverage |
| Workspace API keys | Actual calls, rotation and scope checks; [granular key controls](../product/backend-capability-checklist.md), including spending policy/history, IP policy, distributed RPM/concurrency and estimated TPM | Paid cap admission/settlement; estimator overruns; mixed-key batch fallback and sustained contention |
| Prepaid and accounting | [Financial authorization, exact credit/warning revisions and available capacity](financial-authorization-live-2026-10-09.md); [supported payment inventory](../reference/payment-aggregators.md) | Full successful internal funding/reservation/debit/reconciliation lifecycle evidence, including concurrent liabilities and reversals |
| Request diagnostics | Actual request detail and CSV agree with upstream usage and PostgreSQL; customer prices stay separate from procurement | Complete failure, cancellation, media and commercially charged cross-report coverage |
| Video lifecycle | [Actual generation, idempotency, restart and byte-verified result retrieval](video-submission-idempotency-live-2026-10-09.md); [concurrency occupancy and corrected rotation recovery](../reference/api-key-concurrency-limits.md) | Commercial video settlement evidence; advertised input/channel coverage. Persisted result references depend on upstream content retention |
| Performance | [Native list/detail read measurements](backend-read-performance-2026-10-09.md), [bounded real streaming](streaming-performance-2026-10-09.md), bounded result downloads | Mixed-load, large real datasets, sustained inference/financial contention and explicit operational capacity targets |

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

1. Obtain actual successful internal funding, customer-priced admission, debit,
   release and reversal/reconciliation evidence. Include shared-company funds,
   workspace and key caps, concurrent liabilities and exact historical attribution.
   External merchant activation is not an internal readiness gate. Personal
   upstream-funded requests cannot establish customer debit or commercial supply.
2. Qualify mixed-key batch admission and mixed-protocol concurrent workloads under
   the new key limits. [Distinct-key personal-route isolation](key-limit-isolation-live-2026-10-10.md)
   is verified for RPM, concurrency and TPM, but does not exercise the batch writer.
   TPM uses an explicit byte/output estimate, retains unknown
   reservations, and records known overrun debt; it is not an exact tokenizer.
3. Review routing/failover behavior against the pinned reference. A retry that can
   duplicate uncertain paid execution does not qualify as an improvement. Keep
   attempts and customer charges distinguishable and auditable. The
   [generic-path source review](../reference/upstream-retry-policy.md) identifies
   single-route resolution and incomplete business fallback orchestration; the
   shared client's implicit reqwest retry policy is now explicitly disabled.
   [Schema and candidate-policy review](../architecture/model-routing-evolution.md)
   confirms that one alias currently binds one credential/offer; multiple
   mappings per customer alias and revisioned priority/weight pools need
   implementation before generic failover can preserve pricing and grants.
4. Measure sustained inference/financial contention and larger actual datasets
   against explicit operational capacity targets. Current read measurements use
   a small local dataset and do not establish production throughput.
5. Close advertised media-input/channel coverage and commercial video settlement.
   Saved upstream result references still depend on upstream content retention.

## Recent concrete corrections

- Per-key budget identity now survives secret rotation; spending limits, IP,
  RPM, concurrency and estimated TPM have separate management APIs, histories and
  SDK methods, linked from the primary OpenAPI.
- Actual video generation exposed polling that stopped on the revoked original
  key. Recovery now resolves an eligible current key in the same rotation lineage;
  the original saved job completed after the correction without resubmission.
- [Chat output reservations](../reference/chat-output-reservations.md) now use the
  validated request output bound. The priced input-size guard is implemented but
  its paid end-to-end behavior remains unverified.
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
