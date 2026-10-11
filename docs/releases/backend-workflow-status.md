# Backend workflow verification status

Reviewed 2026-10-12 against main `d3dcf91`; native implementation `0b304dc`.
This is an index of scoped evidence, not a declaration that the complete release
or New API comparison is qualified. Linked runs identify their own implementation
revisions. Fixture outcomes provide no evidence. Current-input runs and
independent saved-artifact/database checks define the verified boundaries.

| User priority | Implemented and exercised scope | Remaining verification boundary |
| --- | --- | --- |
| Supplier configuration | Business identity, independent credential configurations, rotation/disable isolation, model and price binding, scoped configuration traffic | Nonempty agreed commercial earnings and settlement; complete Supplier frontend journey |
| Workspace API keys | Scoped actual model calls, spending/RPM/TPM/concurrency/IP policies, immutable policy history, rotation lineage, revocation and restart | Cross-protocol combinations and unknown-disconnect occupancy; no unlimited-duration key claim |
| Balance and charging | Exact original-rate debits using approved internal credit, insufficient-capacity refusal, reservations, invoice settlement, refunds and reconciliation | Positive externally funded top-ups and customer-paid media have separate unverified scope; supported payment inventory does not require every merchant to activate |
| Logs and usage | Populated customer pagination, concurrent admissions during time-ordered pagination, key filters, full-range totals, CSV, error/timing records and confidential procurement isolation | Mutable-sort pagination, broader tenant scale and frontend presentation |
| Video | Actual personal generation, idempotent submission, durable saved intents, restart/query recovery, authorized decoded results and deletion that survives refresh | Positive customer-funded settlement, natural expiry, inspected reference inputs and model-specific controls need their own evidence |
| Performance | Two-Gateway actual text workloads, including 1,600 streams at offered 12 requests/second with exact post-restart accounting | Maximum capacity, overload, production SLOs, media capacity and a measured New API baseline |

## Evidence to inspect

- Supplier identity and independent keys: [configuration usage](../reference/supplier-configuration-usage.md) and [key isolation](../reference/supplier-key-isolation-live.md).
- Key controls and real streams: [spending and concurrency](../reference/api-key-spending-limits.md); policy errors must not imply an operation completed.
- Exact charging and recovery: [customer reconciliation](../reference/customer-charge-reconciliation.md), [supplemental usage](../reference/token-category-reconciliation.md) and [mixed procurement recovery](../reference/upstream-cost-recovery-paging.md). Procurement costs are not customer charges.
- Payment capability versus activation: [supported integration inventory](../reference/payment-aggregators.md). Checkout and browser returns never authorize funds; no invented paid order or commercial agreement closes a gap.
- Populated reports and measured performance: [two-Gateway text workload](../reference/two-gateway-text-load.md), including independent checks across all 1,600 responses and customer exports.
- Video persistence: [personal lifecycle](openrouter-video-gateway-verification-2026-10-09.md), [durable submission intents](../reference/video-submission-intents.md), [deletion and contention](video-result-deletion-live-2026-10-09.md) and [settled quantity boundary](video-settlement-quantity-verification.md).
- HTTP integration surface: [backend contract](backend-integration-contract.md) and [generated operation reference](../reference/generated-api-operations.md). An authenticated empty read or catalog HTTP 200 does not prove inference.

## OpenRouter diagnosis boundary

Actual committed workloads demonstrate successful streams for the exercised
personal access. They do not reconstruct the original historical 502 root cause.
Connection/catalog success alone is insufficient. Canonical generation metadata
can supplement supported terminal usage, but cancelled or identity-mismatched
observations retain a safe unresolved state; see the
[model identity and cancellation boundary](../reference/token-category-reconciliation.md).
No commercial discount, resale qualification or alias-resolution capability is
inferred from personal testing.

## Workstream boundary

Backend implementation and actual business/performance verification continue on
main. Frontend design and rendered acceptance belong to the frontend workstream;
container/image qualification and Agent Observability are excluded from this
backend iteration. Existing databases and encrypted identity remain preserved.
Public and enterprise issues close only when their own full acceptance is proved;
a partial checkpoint does not close a broader release issue.


## Documentation delivery checkpoint

A clean archive of committed `58e8fc3` completed the documentation build and
handler-annotation consistency check. A local HTTP server served all 17 generated
index-page routes and their linked local resources: 30 unique paths were read
completely, with page bytes compared to the retained generated artifacts. The
handler OpenAPI JSON was accessible and retained the committed Messages and
`/v1beta/models/{model_action}` operations. Uncommitted interface changes were
excluded from this artifact. The error page accounts for the build's additional
page and was not part of the index-route check.

This verifies generated documentation delivery over HTTP, not browser visual
layout, interaction states or deployment. Browser presentation remains unverified.
The documentation links to scoped payment claim/query recovery and concurrent
customer reporting evidence; those runs retain their own executable revisions.


## Confirmed implementation gap: combined Chat tools and JSON format

Current clean implementation `0b304dc` rejects a Chat request combining function
tools with `json_object` or `json_schema`, including streamed requests. A current
workspace-key run declared both individual capabilities and observed explicit
501 responses before any attempt or financial entry. Independent reopening
confirmed zero dispatch and revoked the verification key. This is an implementation
gap, separate from unavailable merchant activation or commercial qualification.

A direct personal OpenRouter observation used the same JSON schema across a
real declared function call, a client-computed tool result and a schema-valid
final answer. Independent inspection checked the retained requests/responses and
native usage. This establishes that observed upstream combination only, not
Niu integration, stream handling, accounting or a link to the original 502.
OpenRouter documents the individual [tool-calling parameters](https://openrouter.ai/docs/guides/features/tool-calling)
and [structured-output parameters](https://openrouter.ai/docs/guides/features/structured-outputs);
parameter listings alone do not qualify their combined behavior through Niu.

Implementation must extend the existing validators rather than merely remove
the refusal. Declared tool-call shape and bounded streamed arguments require
validation, while structured final text must still satisfy its JSON contract.
Intermediate tool turns, final answers, terminal observations and customer
accounting need actual current-input verification before support is claimed.
