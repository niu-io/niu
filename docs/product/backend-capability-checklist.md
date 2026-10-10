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
| Key concurrent-request limit | Implemented; actual two-instance admission, completion, disconnect, rotation and restart verified; single-gateway Chat/Responses/embedding shared occupancy verified | Enforce across supported sync/stream/async lifecycles; release reliably on cancellation, error and recovery |
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
| Generic route selection | Text pool selection implemented; actual personal priority/protocol/capability selection and concurrent weighted traffic verified; long-run distribution and paid paths open | Select eligible credentials with explicit priority/weight and consistent workspace grants and customer pricing |
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

## Financial capability inventory

Source locations identify implemented mechanisms, not completed acceptance.
The current-input [financial checkpoint](../releases/financial-authorization-live-2026-10-09.md)
qualifies its explicitly documented authorization and policy subsets only.

| Capability | Implementation boundary | Required independent acceptance evidence |
| --- | --- | --- |
| Supported payment list | Payment adapters expose availability and supported methods; external refunds are not supported | Inventory matches configured adapters and disabled/unavailable states; each advertised callback contract is checked separately from merchant activation |
| Checkout identity and recovery | Saved orders, idempotency keys, creation claims, provider bindings and reconciliation exist in `payments.rs` | Retried and concurrent checkout creates one order; restart recovers the same pending order without a second charge |
| Settled funding | Installation-only receipt recording and verified adapter settlement exist | Real settlement evidence corresponds to exactly one receipt and ledger credit; repeated receipt is idempotent; changed amount/currency/company is rejected |
| Credit versus cash | Revisioned approved credit is separate from posted funding; empty-account configuration has actual evidence | Admission respects credit plus posted funds minus holds; a credit change never creates a payment or funding receipt |
| Customer price history | Immutable text tariffs and media selling schedules are separate from Supplier rates | A completed request reproduces its customer charge from the pinned effective tariff after subsequent price changes |
| Pre-dispatch reservation | Balance reservation and workspace/key spending checks exist | Concurrent real requests cannot spend the same capacity; denial occurs before upstream dispatch and records no customer charge |
| Shared-company balance | Accounts belong to the company; workspace and key caps constrain their own usage | Competing workspaces share funds without sharing their limits; currency accounts never implicitly convert or net balances |
| Final debit | Text and media charge accrual have separate implementations | Reported usage, historical tariff, exact charge, ledger debit and released hold agree; replay and restart do not duplicate debit |
| Uncertain execution | Unresolved liabilities are retained; nonexecution release recovery exists | Disconnect, timeout and restart preserve uncertain holds; only evidenced nonexecution or completed settlement releases the appropriate amount |
| Usage beyond reservation | Text accrual and durable media liability exist; migration 0214 includes known unsettled media overruns in key/workspace commitments; migration 0215 shares the outstanding-liability calculation across company admission, media debit and reporting; paid verification remains open | Actual overrun remains visible in charge and cap accounting; it cannot be silently discarded or reported as free consumption |
| Internal charge refund | Installation-only balance reversal links to the original charge; this does not execute an external refund | Partial/full concurrent refunds cannot exceed the original debit; idempotent replay is exact and key/workspace commitment is reduced once |
| Funding reversal | Original funding entries support bounded linked reversals | Reversal cannot exceed received funds; resulting debt and remaining capacity are explicit; existing liabilities remain recorded |
| Statements and invoices | Ledger keyset pagination, charge reporting, invoice issuance and invoice payment records exist | All pages reconcile to independent ledger sums; invoices and invoice-payment records do not double-fund prepaid balance or replace its ledger |
| Financial authorization | Installation financial writes and scoped reads have partial actual evidence | Foreign scopes cannot read or mutate funds; customer responses/exports never disclose Supplier expenses, purchase rates or margins |
| Reconciliation and recovery | Charge/release recovery and payment reconciliation mechanisms exist | Restart after each durable boundary converges to one financial result, with unresolved cases visible and no invented completion |

The principal implementation sources are `apps/gateway/src/billing.rs`,
`apps/gateway/src/payments.rs`, `crates/storage/src/billing.rs`,
`crates/storage/src/key_spending.rs` and `crates/storage/src/media_pricing.rs`.
Successful paid admission, debit, refund and reconciliation remain unverified in
this current-input workstream. Owner-funded personal inference does not exercise
these branches. Neither an approved credit configuration nor a fabricated settled
receipt closes those gaps. External merchant activation is not an internal
readiness prerequisite; truthful settlement evidence is still required to claim
an actual payment or funded end-to-end result.

## Text pricing capability boundaries

Persisted token categories and their reports do not imply corresponding rate-card
or settlement support. Default customer tariffs apply two flat rates to aggregate prompt/completion
counts, rounding the combined exact amount upward once. Customer tariffs now
optionally price reported cached input separately; Supplier text offers still use
flat rates. Neither mode implies reproduction of every upstream category charge.

| Capability | Current implementation boundary | Required acceptance behavior |
| --- | --- | --- |
| Flat input/output tariff | Implemented in `TokenRates` and immutable customer tariff revisions; paid current-input verification open | Reproduce the exact charge from aggregate counts and the pinned rates, including one combined rounding step |
| Separate cache-read price | Customer configuration, bounds and accrual implemented; actual configuration verified; Supplier cache pricing and paid settlement open | Pin a distinct rate and non-overlapping counted quantities; unknown cache usage must not become an invented zero |
| Separate cache-write price | Not implemented by the generic two-rate text tariff | Distinguish declared write categories and applicable durations without charging included input twice |
| Separate reasoning-output price | Not implemented by the generic two-rate text tariff | Specify whether reasoning is already included in reported output; apply the agreed schedule without double counting |
| Long-context tiers | Not implemented by the generic two-rate text tariff | Pin threshold, tier selection and effective rates for the actual request, including boundary behavior |
| Per-request charges and minimums | Not implemented by the generic two-rate text tariff | Declare the billable event and minimum/rounding rules independently of token usage |
| Text promotions and discounts | No generic text discount schedule in this tariff | Pin eligibility, priority, stacking and exact effective amounts; editing a promotion cannot reprice history |
| Multimodal text-endpoint units | Generic priced Chat restricts the request to supported plain text | Require explicit meter and liability bounds for image/audio or other billable inputs rather than silently using text rates |

Versioned media rate cards are a separate implementation. Their dimension,
discount and unit mechanisms do not establish generic text tariff coverage.
Customer tariffs and confidential Supplier procurement schedules need independent
histories and authorization. These gaps are required follow-up capabilities, not
reasons to reinterpret a flat tariff as category-specific pricing.

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

See [completion replay and category preservation](../reference/completion-replay.md) for the shared batch/fallback implementation and actual completed-request replay evidence. Paid and mixed-batch failure recovery remain unverified.

See [customer cached-input pricing](../reference/cached-input-pricing.md) for versioning, conservative bounds, missing-usage behavior and the exact current-input verification boundary.

The [customer charge reconciliation report](../reference/customer-charge-reconciliation.md)
compares prepaid-bound text/media charges and original ledger debits without
mutating money. Empty multi-currency reports and real authorization boundaries
are verified; nonempty financial discrepancy cases remain unverified.
