# Commercialization delivery

This plan implements [Supplier pricing continuation](supplier-pricing-continuation.md) before resuming the remaining [35 page/workflow families](page-workflow-audit.md). Implementation and current-input acceptance are separate states. No subsystem is release-qualified by fixture outcomes, builds, catalog visibility or upstream connectivity alone.

## Subsystem progress

| Subsystem | Implementation state | Acceptance state | Next deliverable |
| --- | --- | --- | --- |
| Purchase costs and Supplier qualification | Existing foundation | Partial; complete commercial onboarding unverified | Trace qualified offers, credential/model matching and confidential purchase revisions |
| Standard retail prices for text and video | Missing unified publication workflow | Unverified | Persistent platform standard prices with effective periods, history and concurrent publication protection |
| Global and customer promotions | Explicit text discount revisions and original-price validation implemented; scheduled/global and media policy pending | Unverified | Finite effective periods, exclusive customer-over-global selection, revocation and publication API |
| Operation and video price snapshots | Existing text operation bindings and media snapshots | Partial; new promotion policy unverified | Bind standard-price and promotion provenance atomically before liability reservation; preserve retry/job history |
| Prepaid balance, limits and reconciliation | In progress: existing credit/reservation foundation, noncash grants and source allocation implemented | Gift issuance/retry accepted for the exercised scope; consumption/refund unverified | Current-input source allocation, exact settlement, unresolved usage and independent reconciliation |
| Administration and customer price explanation | In progress: commercial-position table, text discount publication and grant API implemented; financial summary read implemented | Partial: current inventory, empty financial states and administrator/member boundaries verified | Publish/history/expiry workflows, applicable customer prices and applied-rule explanation |
| API, SDK and documentation | In progress: commercial-position, discount, gift and posting-summary contracts implemented | Individual current-input reads/publications qualified; full workflow pending | Synchronized typed endpoints, generated references and served documentation |
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

## Admin commercial overview checkpoint

The Admin sidebar includes **Commercial overview** at `/admin/commercial`, beside Suppliers and Customer pricing. It reads the confidential platform projection, supports currency and 7/30/90-day intervals, and shows current quotes, customer charges, Supplier payable, settled/outstanding earnings, known cost, margin and unresolved/cost coverage. Personal supply remains excluded by the backend. No Supplier-member entry was added.

Current-input browser observation covers actual administrator form sign-in, sidebar navigation, three existing configured model rows, eighteen unavailable monetary cells remaining empty, an unknown-currency error and recovery to USD, and period choices. The 390px menu fits within the viewport; desktop and narrow DOM dimensions showed no document overflow, while the existing Table container retains horizontal access to additional financial columns. Fourteen original financial tables retained exact full-row fingerprints after these reads. TypeScript and dashboard production compilation completed. Fixture outcomes were not used.

Visual screenshot review remains pending: browser screenshot capture timed out on both existing pages, and the system fallback lacked Screen Recording permission. Semantic snapshots and DOM dimensions do not establish complete visual acceptance. Populated financial sums, completed payment coverage, qualified competing offers and the wider commercial release remain unverified.

## Explicit text discount publication checkpoint

The existing platform customer-tariff publication accepts `discount_baseline_revision`. It stores explicit resulting rates in a new immutable revision; it never applies a runtime multiplier. The original must be an undiscounted revision for the same model and currency. Base/category rates, fixed fees, minima and matching context-tier rates cannot increase; category presence and context thresholds cannot change under the discount label. Both the transactional publisher and an insert trigger enforce the same database predicate. Existing rows have a null provenance field without any price backfill. Billing, price history and invoice-line projections carry the selling-price provenance, without Supplier costs or margins.

A current-input run through the built SDK and actual Gateway created one zero-funded administrative workspace, published an original schedule and its explicit discount, rejected invalid references/rates/categories/context edits and a stale revision, then resolved simultaneous publications as one winner and one conflict. Independent PostgreSQL readback found exactly the three resulting tariff revisions, the original rates unchanged, no orphan tariff from the rejected model change, and the expected original-price references. All pre-existing rows in fourteen financial tables were preserved; only three new tariff revisions were added. The customer billing projection matched the winning revision and excluded procurement fields. No inference, payment, financial charge, attempt or operation was created in the new workspace.

This qualifies publication and its persisted configuration artifacts only. Actual discounted inference, retry/video price retention, ordinary-role publication denial, scheduled expiry/fallback and global standard-price management remain open. The retained workspace is evidence, not qualified commercial supply. Fixture outcomes were not used.

## Unified credit and noncash customer funding requirements

One company/currency account supports prepaid and postpaid usage. Approved credit is an admission limit, not funding or income. Zero credit requires prepaid capacity; positive credit permits debt within approved capacity after outstanding liabilities. Existing accounts already calculate available capacity as ledger balance plus credit minus outstanding liability. Workspace/key caps constrain this shared account and must not multiply its credit.

Administrator actions must distinguish approved credit, verified cash funding and noncash promotional grants. A grant must not call the confirmed-cash-funding operation or invent a merchant receipt. It requires its own immutable source, reason, administrator attribution, idempotency and balanced noncash accounting. Customer debits must preserve exact funding-source allocations so refunds restore the original cash/grant components. Grant reversal must not erase history, withdraw already consumed grants, or invalidate outstanding reservations. Cash and grants cannot become interchangeable withdrawal claims.

For the requested example, 100 currency units of consumption can contain 95 units from cash-funded balance and 5 from consumed promotional grants. Recognized revenue in this fully consumed example is 95, nominal consumption is 100, and promotional sales allowance is 5. Do not recognize 100 of revenue and offset it with 5 of promotional expense. Actual receipts remain 95. Unconsumed grants, consumed grants, receivables/credit usage and real cash refunds are separate amounts. Receipt timing and consumption timing can differ, so they must not be forced into the same period total. Commercial reporting must keep nominal consumption, recognized revenue net of consumed gifts, actual cash receipts, promotional sales allowance and the corresponding contribution measures distinct. Credit-funded consumption can recognize revenue and a receivable before cash collection; later repayment must not recognize that revenue again. Issuing a gift recognizes neither revenue nor promotional expense. Existing charge-minus-Supplier-earning margin is not proof of cash profit.

Implementation state: existing credit controls are present. Noncash grant storage, the platform-only grant API, SDK and future debit/refund source-allocation migrations are implemented. Actual current-input grant issuance and exact/concurrent retries were checked through the built SDK and HTTP; independent PostgreSQL reads confirmed one immutable grant, one positive adjustment, a zero-sum noncash memorandum, no payment receipt, no consumption allocation and unchanged zero credit. Anonymous and fresh ordinary owner/viewer sessions were denied. Original rows in 14 financial tables were preserved. Consumption/refund allocation, grant issuance into debt, platform-member actor attribution, administrator UI and the expanded commercial report remain unverified or pending. The 100/95/5 example is a required acceptance case, not a verified transaction. Never manufacture a cash receipt to qualify it.

Required report acceptance example (one currency, fully consumed balance, no tax or refund in this example):

| Report measure | Amount |
| --- | ---: |
| Nominal customer consumption | 100 |
| Consumed administrator gift / sales allowance | 5 |
| Recognized customer revenue, net of gift consumption | 95 |
| Verified customer cash receipts | 95 |

The report must not present 100 as revenue, nor classify the 5 gift as an operating expense to offset inflated revenue. Issuance, consumption, receipts and refunds need separate posting dates and source references. Supplier payables and known upstream expenses remain separate from these customer measures. A report with incomplete source coverage must leave total recognized revenue unknown and disclose the uncovered amount; a known subtotal must not be labeled as the complete total.

### Noncash issuance checkpoint

`POST /admin/v1/organizations/{organization}/billing/accounts/{currency}/grants` and `NiuAdminClient.grantCustomerBalance` issue positive exact nanounit gifts with a reason and company-scoped UUID idempotency key. Explicit platform administration is required; customer ownership does not grant this authority. The endpoint does not create verified funding, payment orders, debt forgiveness or income. Changed idempotency reuse is rejected. Gift allocation uses account serialization and immutable entries; old records are not backfilled. The actual issuance checkpoint qualifies this operation only, not the 100/95/5 consumption example or financial release readiness.

### Financial posting summary checkpoint

`GET /admin/v1/financial-summary` and `NiuAdminClient.getCustomerFinancialSummary` keep confirmed nominal consumption, customer refunds, consumed-gift sales allowance, net recognized revenue, gift issuance and verified cash receipt records distinct. They use each record's posting timestamp, not the commercial comparison's dispatch cohort. Missing consumption allocation makes full revenue and allowance unavailable; explicitly named known subtotals remain partial. Potential duplicate references between legacy invoice payments and balance funding make the combined cash receipt total unavailable. Funding reversals remain ledger records, not proof of an external cash refund transfer.

Actual current-input HTTP and built-SDK reads exercised USD 7/30/90-day intervals, anonymous denial, ordinary owner/viewer denial, invalid period/currency/query denial and no-store. A separate PostgreSQL artifact read and independent integer aggregation exactly matched every returned monetary and coverage field at the returned bounds. Gift issuance did not create consumption or a payment receipt. Original financial records remained unchanged. These reads qualify only the current saved-data projection and exercised authorization; populated consumption/refunds, credit repayment, duplicate-receipt reconciliation, the 100/95/5 workflow and rendered administrator reporting remain unverified.
