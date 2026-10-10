# Backend capability acceptance checklist

This checklist splits broad feature names into observable behavior. An API field,
page, model listing, successful build or fixture outcome does not establish an
integrated capability. Track implementation and current-input verification
separately. The broader [delivery audit](../releases/backend-delivery-audit-2026-10-09.md)
links existing evidence and the pinned New API reference.

## API-key controls

| Capability | Implementation status | Required acceptance behavior |
| --- | --- | --- |
| Workspace ownership and model allowlist | Implemented; scoped actual calls recorded | A key cannot use another workspace's private route or an ungranted model; dispatch rechecks current permissions |
| Expiration and revocation | Implemented; actual rejection recorded | Expired/revoked keys cannot dispatch; historical records remain available through authorized management |
| Rotation | Implemented; actual calls recorded | Old secret stops working, replacement retains intended grants, unrelated keys remain usable |
| Independent currency spending cap | Implemented; paid admission/settlement verification open | Key-level committed charges plus outstanding customer-price reservations cannot admit work beyond the cap; company/workspace limits also apply |
| Remaining key allowance | Implemented; exact empty-commitment reads and rotation verified | Return exact remaining nanounits, zero when exhausted and null for unlimited; distinguish key allowance from shared company funds and overall admission capacity |
| Cap lifecycle and history | Implemented; actual configuration/concurrency verified | Exact integer amounts, explicit unlimited state, optimistic revisions, owner authorization, immutable actor history; lowering cannot invalidate liabilities |
| Cap during rotation | Implemented; actual shared-policy/history verified | Specify whether the replacement shares the original budget identity; rotating a secret must not silently reset or bypass its spending allowance |
| IP allowlist | Implemented; actual direct/proxy, rotation and saved-video access verified | Validate addresses/CIDRs; use a defined trusted-proxy policy; reject disallowed origins before upstream dispatch |
| Key request rate limit (RPM) | Implemented; actual two-instance admission and video rejection verified | Rolling 60-second dispatch count shared across rotations and gateways; reject before upstream calls |
| Key token rate budget (TPM) | Estimated text admission implemented; dual-instance Chat and individual Responses/embeddings calls verified | Reserve estimated input/output before dispatch; count actual known usage and retain unknown reservations; qualify estimator and unsupported modalities explicitly |
| Key concurrent-request limit | Implemented; actual two-instance admission, completion, disconnect, rotation and restart verified | Enforce across supported sync/stream/async lifecycles; release reliably on cancellation, error and recovery |
| Key usage attribution | Implemented; partial actual evidence | Calls, provider usage and customer charges agree across key/detail/export views; unknown usage remains unknown |
| Independent-key limit isolation | Actual personal-route RPM/concurrency/TPM isolation verified; batch and paid paths open | Exhausting one key must not reject another eligible key; shared workspace/company constraints still apply |

Supplier-account concurrency limits, login throttles and the global video-download
semaphore are different controls. They do not satisfy per-key inference limits.
Workspace spending limits do not satisfy per-key spending limits.

See [actual concurrent distinct-key verification](../releases/key-limit-isolation-live-2026-10-10.md)
for the independently checked dispatch and usage records and its path limitations.

## Routing and retries

| Capability | Implementation status | Required acceptance behavior |
| --- | --- | --- |
| Generic route selection | Text pool selection implemented; actual personal priority/protocol selection and concurrent weighted traffic verified; long-run distribution and paid paths open | Select eligible credentials with explicit priority/weight and consistent workspace grants and customer pricing |
| Multiple supply mappings per customer alias | Additive pools implemented; actual public-alias grants and distinct mapping attribution verified | Keep one customer model identity while independently managing multiple Supplier credential/model/offer mappings |
| Candidate policy management | Installation API/SDK implemented; actual revision concurrency, history and scoped rejection verified | Revisioned pool membership, priorities, weights, enabled state and authorized change history |
| Selected route revision binding | Implemented for generic managed routes; actual personal Chat model-revision race verified | Persist selected credential/model revisions; reject stale configuration before dispatch and retain immutable attribution |
| Transport retry policy | Shared client's implicit reqwest retries explicitly disabled; fault qualification open | Every application retry has an auditable attempt and an explicit bounded policy |
| Safe business failover | Generic fallback orchestration incomplete | Retry only when the previous execution is proven safe to repeat; preserve unknown outcomes and liabilities, including partial streams |
| Route health and recovery | Cross-adapter coverage unverified | Define cooldown, concurrent probes and re-entry; expose diagnostic reasons without leaking credentials or procurement data |

See [upstream retry policy and inspected routing gaps](../reference/upstream-retry-policy.md).
The [routing implementation design](../architecture/model-routing-evolution.md)
records the schema constraints, financial invariants and delivery sequence.
See [model route pools](../reference/model-route-pools.md) for the implemented
selection contract and exact current-input evidence.

## Financial hierarchy

Company balance/approved credit, workspace caps and key caps are distinct layers.
A paid request must satisfy all applicable layers using customer selling prices.
Personal upstream-key use stays separate from customer funds; its treatment must
be explicit in every cap API and report. Reservations, final charges, refunds and
releases must retain one historical key/budget attribution through rotation and
recovery. Settled liabilities are recorded accurately even when actual reported
usage exceeds the pre-dispatch bound; an overrun must not become hidden free work.

## Required workflow checks

For each control, cover authorized configuration, unauthorized writes, stale
revisions, normal dispatch, concurrent dispatch, streaming disconnect, uncertain
upstream completion, retry/idempotency, service restart and independent durable
record verification where applicable. Check text and video explicitly. State
unsupported cases instead of inheriting confidence from a different path.

This checklist is an implementation backlog, not a claim of New API parity.
External merchant activation remains a deployment concern; internal accounting
and authorization still need their own implementation and evidence.

See [key spending implementation and current-input evidence](../reference/api-key-spending-limits.md) for the exact supported boundary and remaining financial checks.

See [key IP policies](../reference/api-key-ip-policies.md) for source-address trust rules and verification boundaries.

See [key request rate limits](../reference/api-key-request-rate-limits.md) for dispatch-count semantics and remaining verification.

See [key concurrency limits](../reference/api-key-concurrency-limits.md) for unresolved-work occupancy and remaining verification.

See [key token rate budgets](../reference/api-key-token-rate-limits.md) for estimation limits, window semantics and verification gaps.
