# Commercialization delivery

This plan implements [Supplier pricing continuation](supplier-pricing-continuation.md) before resuming the remaining [35 page/workflow families](page-workflow-audit.md). Implementation and current-input acceptance are separate states. No subsystem is release-qualified by fixture outcomes, builds, catalog visibility or upstream connectivity alone.

## Subsystem progress

| Subsystem | Implementation state | Acceptance state | Next deliverable |
| --- | --- | --- | --- |
| Purchase costs and Supplier qualification | Existing foundation | Partial; complete commercial onboarding unverified | Trace qualified offers, credential/model matching and confidential purchase revisions |
| Standard retail prices for text and video | Missing unified publication workflow | Unverified | Persistent platform standard prices with effective periods, history and concurrent publication protection |
| Global and customer promotions | Retail selection primitive implemented; persistence and integration pending | Unverified | Finite effective periods, exclusive customer-over-global selection, revocation and publication API |
| Operation and video price snapshots | Existing text operation bindings and media snapshots | Partial; new promotion policy unverified | Bind standard-price and promotion provenance atomically before liability reservation; preserve retry/job history |
| Prepaid balance, limits and reconciliation | Existing foundation | Partial | Current-input reservations, exact settlement, unresolved usage and independent ledger reconciliation |
| Administration and customer price explanation | Existing Supplier and customer pricing surfaces | Partial | Publish/history/expiry workflows, applicable customer prices and applied-rule explanation |
| API, SDK and documentation | Existing contracts | New commercial contracts pending | Synchronized typed endpoints, generated references and served documentation |
| Remaining product workflows | Inventory complete | See individual page states | Resume page-family acceptance after the commercial workflow is integrated |
| Performance and release recovery | Existing limited evidence | Full qualification pending | Fixed workload measurements and durable recovery without overwriting existing identities |

## Existing binding points and constraints

- Text publication currently writes workspace-specific `customer_tariff_revisions`. `bind_customer_tariff_in_tx` binds attempts, and migration `0223_operation_customer_tariff.sql` pins the operation revision. The new workflow must retain that immutable operation boundary. It must not rewrite historical revisions or assume that an updated workspace tariff can reprice a retry.
- Media schedules currently contain customer-specific tariff and discount documents. `select_customer_media_rate` selects a dimensional schedule; `customer_media_attempt_pricing` retains a validated calculation snapshot. A standard media selling price cannot invent a qualified Supplier offer, schema or liability bound.
- The generic metered-cost selector supports priority and multiplication for existing contracts. Its snapshot decoder must retain these semantics. The new `pin_customer_retail_pricing` entry point selects at most one finite, exclusive promotion: eligible customer scope before eligible global scope, then the standard tariff if neither applies. Ambiguous rules in the winning scope fail closed. This primitive is not yet used by admission or settlement.
- Promotion eligibility uses inclusive start and exclusive end. Selection time must come from the authoritative admission transaction, not a browser clock. Revoke or expire eligibility for future operations while keeping already selected records immutable.
- Apply discounts to exact calculated customer amounts with declared rounding and overflow checks. Reservation and settlement must use the same pinned policy, including request fees, minima, token categories, context tiers and media units. Unknown usage must remain unresolved rather than becoming a zero charge.
- Standard prices and promotions are platform selling configuration. Customer responses expose only the requesting customer's applicable price and applied promotion. Supplier purchase prices, expenses and platform margins remain outside customer serialization. Supplier membership does not grant platform pricing authority.

## Ordered delivery gates

1. Complete the source trace through discovery, admission, liability reservation, retries, accrual and asynchronous media settlement. Specify standard-price authority and compatibility with existing workspace prices before migrations.
2. Implement persistent standard-price and promotion publication/history/revocation, permission checks and concurrent overlap protection for text and video.
3. Integrate selection and immutable provenance with admission, reservations, retries and settlement. Verify actual current-input transitions and independently inspect stored financial artifacts.
4. Implement and browser-verify administration and customer explanation at desktop and narrow widths, using inspected mature-product references and existing UI primitives.
5. Synchronize HTTP, SDK, generated references and served documentation; complete pricing boundaries, role isolation, exact rounding, expiry fallback, concurrent publication and replay acceptance.
6. Resume each remaining page/workflow family, close issues only when their full acceptance is proven, then qualify performance and release recovery.

External merchant activation and successfully connecting every supported payment service are separate from integration capability readiness. Paid generation requires its own authorization; a personal Supplier route does not establish zero upstream cost or commercial resale eligibility.
