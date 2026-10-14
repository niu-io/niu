# Commercialization delivery

This plan implements [Supplier pricing continuation](supplier-pricing-continuation.md) before resuming the remaining [35 page/workflow families](page-workflow-audit.md). Implementation and current-input acceptance are separate states. No subsystem is release-qualified by fixture outcomes, builds, catalog visibility or upstream connectivity alone.

## Subsystem progress

| Subsystem | Implementation state | Acceptance state | Next deliverable |
| --- | --- | --- | --- |
| Purchase costs and Supplier qualification | Existing foundation | Partial; complete commercial onboarding unverified | Trace qualified offers, credential/model matching and confidential purchase revisions |
| Standard retail prices for text and video | Missing unified publication workflow | Unverified | Persistent platform standard prices with effective periods, history and concurrent publication protection |
| Global and customer promotions | Revised design: explicit discounted tariff revisions; publication pending | Unverified | Finite effective periods, exclusive customer-over-global selection, revocation and publication API |
| Operation and video price snapshots | Existing text operation bindings and media snapshots | Partial; new promotion policy unverified | Bind standard-price and promotion provenance atomically before liability reservation; preserve retry/job history |
| Prepaid balance, limits and reconciliation | Existing foundation | Partial | Current-input reservations, exact settlement, unresolved usage and independent ledger reconciliation |
| Administration and customer price explanation | Commercial-position read and SDK implemented; table and discount publication pending | Partial: current inventory, empty financial states and administrator/member boundaries verified | Publish/history/expiry workflows, applicable customer prices and applied-rule explanation |
| API, SDK and documentation | Existing contracts | New commercial contracts pending | Synchronized typed endpoints, generated references and served documentation |
| Remaining product workflows | Inventory complete | See individual page states | Resume page-family acceptance after the commercial workflow is integrated |
| Performance and release recovery | Existing limited evidence | Full qualification pending | Fixed workload measurements and durable recovery without overwriting existing identities |

## Existing binding points and constraints

- Text publication currently writes workspace-specific `customer_tariff_revisions`. `bind_customer_tariff_in_tx` binds attempts, and migration `0223_operation_customer_tariff.sql` pins the operation revision. The new workflow must retain that immutable operation boundary. It must not rewrite historical revisions or assume that an updated workspace tariff can reprice a retry.
- Media schedules currently contain customer-specific tariff and discount documents. `select_customer_media_rate` selects a dimensional schedule; `customer_media_attempt_pricing` retains a validated calculation snapshot. A standard media selling price cannot invent a qualified Supplier offer, schema or liability bound.
- The generic media metered-cost selector and stored snapshot decoder retain their existing contracts. New commercial discounts publish explicit customer selling-rate revisions with a baseline reference and resulting rates, rather than applying a runtime ratio. Effective global and customer-specific publication rules still require finite periods and customer-over-global fallback; they must materialize the selected revision before admission pins it. The previously added, unused retail multiplier entry point was removed to avoid introducing a second billing mechanism.
- Promotion eligibility uses inclusive start and exclusive end. Selection time must come from the authoritative admission transaction, not a browser clock. Revoke or expire eligibility for future operations while keeping already selected records immutable.
- Apply discounts to exact calculated customer amounts with declared rounding and overflow checks. Reservation and settlement must use the same pinned policy, including request fees, minima, token categories, context tiers and media units. Unknown usage must remain unresolved rather than becoming a zero charge.
- Standard prices and promotions are platform selling configuration. Customer responses expose only the requesting customer's applicable price and applied promotion. Supplier purchase prices, expenses and platform margins remain outside customer serialization. Supplier membership does not grant platform pricing authority.

## Accepted commercial-position design

[Issue #20](https://github.com/niu-io/niu/issues/20) is an implementation reference, reviewed against the ledger contracts. The platform administrator compares Suppliers in one table; customers and Supplier members cannot access it. Existing Supplier-member APIs remain compatible but gain no new product entrance.

The read groups by Supplier, customer-facing alias and configured currency. Distinct route-pool candidates remain separate offers within a row. Dispatch-period membership and all totals come from one database snapshot. Charges mean confirmed retail charges, not merchant cash receipts; balance debit or invoice-payment settlement must be shown separately if the product needs actual payment coverage. Supplier settlements remain records of confirmed external payments. Margin compares matching customer charges and Supplier earnings, stays unavailable for unresolved execution or ledger coverage, and never subtracts upstream cost into that same figure. Cost has its own known-attempt coverage. Personal routes are excluded from inventory and every total.

The new read/SDK contracts are implemented. Current-input PostgreSQL, actual HTTP and the built SDK returned three existing configuration rows without customer charges. Administrator access returned 200 with no-store; a genuine ordinary member returned 403 without commercial data, signed-out access returned 401, and an unsupported period and unknown currency returned 400. API rows exactly matched an independent database read at the returned interval. Fourteen financial tables retained identical full-row fingerprints across the runtime replacement and reads. The temporary CLI member session was revoked. These observations qualify existing inventory, empty financial states and the exercised access boundaries only. Populated financial sums, two competing qualified offers, Supplier-member and workspace-key rejection, exact payment coverage, and browser presentation remain unverified. No new inference, payment or financial mutation was performed.

## Ordered delivery gates

1. Complete the source trace through discovery, admission, liability reservation, retries, accrual and asynchronous media settlement. Specify standard-price authority and compatibility with existing workspace prices before migrations.
2. Implement persistent standard-price and promotion publication/history/revocation, permission checks and concurrent overlap protection for text and video.
3. Integrate selection and immutable provenance with admission, reservations, retries and settlement. Verify actual current-input transitions and independently inspect stored financial artifacts.
4. Implement and browser-verify administration and customer explanation at desktop and narrow widths, using inspected mature-product references and existing UI primitives.
5. Synchronize HTTP, SDK, generated references and served documentation; complete pricing boundaries, role isolation, exact rounding, expiry fallback, concurrent publication and replay acceptance.
6. Resume each remaining page/workflow family, close issues only when their full acceptance is proven, then qualify performance and release recovery.

External merchant activation and successfully connecting every supported payment service are separate from integration capability readiness. Paid generation requires its own authorization; a personal Supplier route does not establish zero upstream cost or commercial resale eligibility.
