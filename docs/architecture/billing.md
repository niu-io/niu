# Open-source usage billing

Niu owns usage calculation and accounting in its public runtime. Community installations can calculate customer bills and supplier payables without a private service. Payment collection and transfers are separate integrations; the current runtime records confirmed external payments but does not move money.

## Three independent amounts

| Ledger | Price source | Meaning |
| --- | --- | --- |
| Upstream costs (`cost_entries`) | Existing model cost schedule | Platform expenditure and existing cost-budget accounting |
| Customer charges (`customer_charges`) | Workspace/model selling tariff | Amount the consuming customer owes |
| Provider earnings (`provider_earnings`) | Supplier/model payout offer | Amount the platform owes the supplying business |

No ledger is inferred from another. A provider can earn a different amount from the customer's charge. There is no default platform fee, revenue share or foreign-exchange conversion. Existing cost budgets remain upstream-cost limits, not prepaid customer credit limits. Upstream costs and these budgets are installation-only accounting APIs, with no consumer navigation; customer Usage shows operational metrics and Billing shows retail charges.

## Rates and arithmetic

Installation administrators publish explicit rates per model alias: customer selling rates are scoped to an organization/project; supplier payout rates are scoped to a provider offer. Updating a rate requires its current revision, creates an immutable revision, and does not rewrite historical usage.

Rates are decimal strings of integer currency nanounits per million input/output text tokens. One currency unit is 1,000,000,000 nanounits. Currency codes contain three uppercase letters; installations must choose the currencies they actually support. The runtime does not certify legal currency codes or convert currencies.

Each admitted attempt snapshots the applicable revisions before dispatch. Confirmed provider-reported usage accrues independently in each ledger:

```
amount_nanos = ceil((input_tokens * input_rate + output_tokens * output_rate) / 1_000_000)
```

The combined charge is rounded up once per attempt to one nanounit using wide integer arithmetic. Invoice and settlement totals sum the persisted amounts, so statement totals reconcile exactly with the ledger. Public JSON uses strings for amounts and aggregate token counts to avoid JavaScript precision loss.

A missing selling tariff means the request is excluded from retail billing, not that a zero rate was agreed. The billing overview reports these unpriced requests. Adding a rate never retroactively bills them. A missing supplier offer likewise creates no supplier payable. Publish both price schedules before routing commercial traffic. An explicit zero rate is supported.

## Usage lifecycle and recovery

Only confirmed completed attempts with provider-reported usage produce charges and earnings. Missing or ambiguous usage remains unresolved, never silently zero. A dispatched attempt confirmed not executed produces no charge and is excluded from unresolved/unpriced billing counts and invoice reconciliation gates. This does not apply to an attempt that may have executed: unknown execution or usage still requires reconciliation. Each attempt can accrue once in each ledger. A bounded background recovery worker retries independently after failures; a malformed record does not starve other records.

Retries are separate upstream attempts and, if each reports completed usage, each accrues. This version has no automatic retry-credit policy. Known usage must be recorded before issuing bills; there is no implemented manual reconciliation or credit-note API for unresolved usage. Operators must resolve source-of-truth discrepancies before closing affected periods.

## Customer invoices

The workspace Billing page shows customer selling rates, unbilled charges, issued unpaid invoices and confirmed payment records separately by currency. Workspace read permissions allow viewing; only installation administrators can change rates, issue invoices or record payments. Cross-project reads are rejected by the API.

An invoice uses a closed UTC dispatch interval `[from_ms, to_ms)`, at most 366 days, and one currency. Issuance rejects future periods, overlapping invoices in the same workspace/currency, empty periods and any priced dispatched request awaiting reconciliation. A project lock serializes admission with closure. The immutable invoice links every included charge once; line items group by model and pinned rate revision. Exact retries with the same idempotency key return the original invoice; changed payloads conflict.

Customer payment reconciliation records one confirmed full external payment per invoice. The reference is unique across customer payments. Repeated submissions of the same invoice/reference are idempotent. This is a usage statement, not a jurisdiction-specific tax invoice, and no card is charged by this action.

## Provider settlement

See [provider workspace](provider-workspace.md) for supplier access and offer management. Installation administrators record an external payment against up to 1,000 selected earned attempts from one supplier and one currency. The server computes the total and links each earning once. Provider-scoped idempotency keys and payment references prevent replay and duplicate settlement. Partial payments, adjustments and automatic bank transfers are not implemented.

## API and persistence

Customer endpoints live under `/admin/v1/organizations/{organization}/projects/{project}/billing`; supplier endpoints under `/admin/v1/providers`. See the [API contract](../../contracts/openapi.yaml). All responses use `Cache-Control: no-store`. Financial revisions, ledger entries, invoices, settlement allocations and audit events are append-only, protected against update/delete in PostgreSQL. Write operations and their audit entries commit together.

Migrations `0017_provider_business.sql` and `0018_customer_billing.sql` add these tables without relabeling or backfilling upstream costs. Existing installations require explicit commercial configuration before usage accrues. Administrative financial audit records identify installation authority; this release does not distinguish individual bootstrap tokens.

## Current scope

This version covers input/output text-token charges. Cache discounts, image/audio pricing, fixed request fees, volume tiers, subscriptions, credits/refunds, taxation, legal invoicing, prepaid wallet enforcement, payment processors, automatic payout execution and currency conversion are not implemented. Do not configure a model under this schedule if its usage requires unsupported billing dimensions. There are no fabricated live balances or automatic production rates.

Read views currently cap invoice/settlement history at 100 records and configured offers/tariffs at 1,000; balances always include the full ledger. Export and paginated accounting history remain future work. PostgreSQL integration tests cover pinned rates, independent ledgers, unresolved usage, tenant isolation, replay, concurrent payment recording and immutability.
