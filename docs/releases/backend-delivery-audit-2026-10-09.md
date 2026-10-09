# Backend delivery audit and New API comparison

Date: 2026-10-09. Backend work continues on main. This is an open delivery audit,
not release acceptance. Frontend/browser work, container qualification and Agent
Observability are outside this workstream. External merchant activation is not an
internal-readiness gate. Fixture outcomes have no evidentiary weight.

## Current business evidence

| Required area | Current actual evidence | Still unverified or incomplete |
| --- | --- | --- |
| Supplier configuration | [Independent credentials, scoped routes and price revision concurrency](supplier-workspace-backend-verification-2026-10-09.md) | Complete commercial purchase/selling/settlement journey; broader provider coverage |
| Workspace API keys | Actual model calls, rotation, revocation/expiry rejection and scope checks in the Supplier report | Independent per-key monetary limits are not implemented; workspace limits are not a substitute |
| Prepaid and accounting | [Financial authorization, exact credit/warning revisions and available capacity](financial-authorization-live-2026-10-09.md); [supported payment inventory](../reference/payment-aggregators.md) | Full successful internal funding/reservation/debit/reconciliation lifecycle evidence, including concurrent liabilities and reversals |
| Request diagnostics | Actual request detail and CSV agree with upstream usage and PostgreSQL; customer prices stay separate from procurement | Complete failure, cancellation, media and commercially charged cross-report coverage |
| Video lifecycle | [Actual generation, idempotency, restart and byte-verified result retrieval](video-submission-idempotency-live-2026-10-09.md) | Commercial video settlement evidence; advertised input/channel coverage. Persisted result references depend on upstream content retention |
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
restrictions, expiration, IP restrictions and group selection. Niu's current
`KeyView` and key-issuance contract do not contain a monetary cap or an IP policy.

New API's [project introduction](https://github.com/QuantumNous/new-api-docs-v1/blob/main/content/docs/en/guide/wiki/basic-concepts/project-introduction.mdx)
also describes channel balancing and failover. Its
[task plugin contract](https://github.com/QuantumNous/new-api/blob/1d4328e97417a043a161a0dd30a5b129be3ace49/docs/plugin-api/v1.md)
is a reference for async task and billing behavior. Detailed source review and
comparable current-input measurements remain necessary before any parity claim.
No upstream source is imported by this audit.

The [backend capability checklist](../product/backend-capability-checklist.md)
separates key-level controls and financial layers into observable requirements.

## Next implementation priority

Add independently configurable per-key customer spending limits, including exact
currency amounts, optimistic revisions and authorized API/SDK management. Enforce
them in the same durable transaction as customer liability reservation, for both
text and video; account for committed charges and outstanding holds without
borrowing Supplier prices. Retain company/workspace limits, personal-route
separation, idempotent settlement and historical attribution. Verify concurrent
admission and release/reconciliation, not just configuration persistence.

After that, assess IP restrictions and routing/failover against the pinned
reference, preserving safe handling of uncertain paid execution. A failover that
can duplicate paid work does not qualify as an improvement.
