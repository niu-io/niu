# Usage billing

Status: current ledger behavior. [Architecture](../../ARCHITECTURE.md) is the runtime overview. This document is the billing contract.

Niu calculates customer charges and Supplier earnings in the public gateway. Prepaid company balance admits paid requests. Customer top-ups can arrive through a configured Stripe, EPay, or Zhifux checkout and credit that balance after verification. Supplier settlement records an external payment; it does not send one.

## Three independent amounts

| Ledger | Price source | Meaning |
| --- | --- | --- |
| Upstream costs (`cost_entries`) | Existing model cost schedule | Platform expenditure and existing cost-budget accounting |
| Customer charges (`customer_charges`, `customer_media_charges`) | Workspace/model text tariff or media selling schedule | Customer-facing charge for the attempt |
| Provider earnings (`provider_earnings`) | Supplier/model payout offer | Amount the platform owes the supplying business |

No ledger is inferred from another. A provider can earn a different amount from the customer's charge. There is no default platform fee, revenue share or foreign-exchange conversion. Existing cost budgets remain upstream-cost limits, not prepaid customer credit limits. Upstream costs and these budgets are installation-only accounting APIs, with no consumer navigation; customer Usage shows operational metrics and Billing shows retail charges.

## Rates and arithmetic

Installation administrators publish explicit rates per model alias: customer selling rates are scoped to an organization/project; supplier payout rates are scoped to a provider offer. Updating a rate requires its current revision, creates an immutable revision, and does not rewrite historical usage.

Rates are decimal strings of integer currency nanounits per million input/output text tokens. One currency unit is 1,000,000,000 nanounits. Currency codes contain three uppercase letters; installations must choose the currencies they actually support. The runtime does not certify legal currency codes or convert currencies.

Each admitted attempt snapshots the applicable revisions before dispatch. Confirmed provider-reported usage accrues independently in each ledger. Text charges round up once, in nanounits:

```text
ceil((uncached_input * input_rate + cached_input * cached_rate + output * output_rate) / 1_000_000)
```

`uncached_input` is input minus cached input. Without a cached rate, all input uses `input_rate`. A cached rate requires a known cached quantity no larger than the input; missing cached usage stays unresolved. Rates are nanounits per million tokens. Invoice and settlement totals sum the persisted amounts. Public JSON uses strings for amounts and aggregate token counts.

A missing selling tariff means the request is excluded from retail billing, not that a zero rate was agreed. The billing overview reports these unpriced requests. Adding a rate never retroactively bills them. A missing supplier offer likewise creates no supplier payable. Publish both price schedules before routing commercial traffic. An explicit zero rate is supported.

## Usage lifecycle and recovery

Only confirmed completed attempts with provider-reported usage produce charges and earnings. Missing or ambiguous usage remains unresolved, never silently zero. A dispatched attempt confirmed not executed produces no charge and is excluded from unresolved/unpriced billing counts and invoice reconciliation gates. This does not apply to an attempt that may have executed: unknown execution or usage still requires reconciliation. Each attempt can accrue once in each ledger. A bounded background recovery worker retries independently after failures; a malformed record does not starve other records.

Retries are separate upstream attempts and, if each reports completed usage, each accrues. This version has no automatic retry-credit policy. Known usage must be recorded before issuing bills; there is no implemented manual reconciliation or credit-note API for unresolved usage. Operators must resolve source-of-truth discrepancies before closing affected periods.

## Prepaid balance

A company balance account is one row per organization and currency. Available capacity is the balance plus the approved credit limit, minus outstanding customer liability. Open reservations count the greater of their reserved amount and any known unposted media charge; a posted debit is not counted again. Workspace and key caps constrain usage of that shared balance. Enabling the account makes paid admission use the customer tariff. An unpriced shared model is rejected for that company. Personal routes reject commercial route pricing and bypass commercial tariff binding.

Settlement of a confirmed, provider-reported attempt inserts `customer_charges` and, when the attempt was reserved against a balance, a negative balance entry. The reservation is released in that same transaction. A charge already debited from the balance can still appear on an invoice. Recording the invoice payment does not credit the balance.

## Customer invoices

Invoices summarize charges and do not grant spending capacity. `due_nanos` excludes charges settled by an invoice receipt or an exact balance debit against the attempt’s pinned account, workspace and currency. `paid_nanos` includes those charges once, including balance debits before invoicing. `unbilled_nanos` still means charges not yet included in an invoice, regardless of settlement. A zero-value charge has no payment obligation. Invoice status is `paid` when a receipt exists or every included charge is settled; its amount remains the original gross statement total. Balance settlement can consume approved credit: any account debt remains in the balance ledger and is not duplicated as invoice debt. Refunds do not reopen the historical invoice obligation. The workspace Billing page can show selling rates, unbilled charges, issued invoices, and confirmed invoice payments by currency. Workspace read permissions allow viewing; only installation administrators can change rates, issue invoices, or record invoice payments. Cross-project reads are rejected by the API.

An invoice uses a closed UTC dispatch interval `[from_ms, to_ms)`, at most 366 days, and one currency. Issuance rejects future periods, overlapping invoices in the same workspace/currency, empty periods and any priced dispatched request awaiting reconciliation. A project lock serializes admission with closure. The immutable invoice links every included charge once; text line items group by model and pinned rate revision, while media lines retain each immutable retail receipt. Exact retries with the same idempotency key return the original invoice; changed payloads conflict.

Customer payment reconciliation records one confirmed full external payment per positive, invoice-only receivable. New records are rejected for invoices containing any balance-bound charge, including mixed invoices and charges awaiting a debit; those obligations belong to the pinned balance account. Zero-value invoices are also rejected. This API does not support partial external payments. The reference is unique across customer payments. Repeated submissions of the same invoice/reference are idempotent. This is a usage statement, not a jurisdiction-specific tax invoice, and no card is charged by this action.

## Provider settlement

See [provider workspace](provider-workspace.md) for supplier access and offer management. Installation administrators record an external payment against up to 1,000 selected earned attempts from one supplier and one currency. The server computes the total and links each earning once. Provider-scoped idempotency keys and payment references prevent replay and duplicate settlement. Partial payments, adjustments and automatic bank transfers are not implemented.

## API and persistence

Customer endpoints live under `/admin/v1/organizations/{organization}/projects/{project}/billing`; supplier endpoints under `/admin/v1/providers`. See the [API contract](../../contracts/openapi.yaml). All responses use `Cache-Control: no-store`. Financial revisions, ledger entries, invoices, settlement allocations and audit events are append-only, protected against update/delete in PostgreSQL. Write operations and their audit entries commit together.

Migrations `0017_provider_business.sql` and `0018_customer_billing.sql` added these tables without relabeling or backfilling upstream costs. Later migrations add prepaid balances and cached input rates. Media customer charges use `customer_media_charges`; Supplier media earnings use the shared earnings table with their own meter and quantity evidence. Existing installations require explicit commercial configuration before usage accrues. Administrative financial audit records identify installation authority; bootstrap-token actions are not attributed to a named member.

## Current scope

Text input, cached input, and output tokens use the integer schedule above. Video estimates use the separate integer media calculator. Prepaid balance, credit limits, reservations, and verified top-ups are enforced in PostgreSQL. Stripe, EPay, and Zhifux are checkout adapters for those top-ups.

Currency conversion, automatic Supplier bank payout, volume tiers, and a credit-note API for unresolved usage are not implemented. A model whose usage needs an unsupported dimension must not be given a text-only tariff and treated as fully priced.

Read views cap invoice and settlement history at 100 records and configured offers or tariffs at 1,000. Balance totals include the full ledger. Priced admission now commits attempt bindings, reservation and dispatch intent together, after any price-cache publication. Financial recovery uses one claimed connection from the shared pool, per-row savepoints and durable stage cursors. Content maintenance is independently scheduled and uses a separate claim; neither reserves capacity for foreground admission. See [architecture](../../ARCHITECTURE.md), [admission evidence](../reference/priced-admission-atomicity.md), and [recovery evidence](../reference/financial-recovery-coordination.md). Credit-backed text debit, invoice settlement, key spending enforcement and a balance refund now have [current-input evidence](../reference/internal-credit-workflow-live.md). A [single real pending customer charge](../reference/financial-backlog-restart-live.md) also recovered across restart. Merchant funding, media debit, multi-instance nonempty recovery and performance remain unqualified.

On 2026-10-10, the shared invoice settlement read model was executed against the current database, which contains no customer charges. After rebuilding and restarting the gateway, the actual workspace billing API returned HTTP 200 with empty balances and invoices, consistent with an independent database read. Compilation and static checks completed; no fixture outcome was used as evidence. That empty-account observation did not verify positive charging. The later isolated credit workflow covers positive text debits and a refund; mixed settlement remains unverified.

Workspace billing pending counts recognize both text tariffs and media pricing snapshots, using each meter’s own charge table. Personal routes and confirmed nonexecution are excluded. Invoice issuance and balance totals now read both customer ledgers through `customer_invoice_charge_sources`. Invoice entries retain scoped foreign keys and validate the source charge, currency and dispatch period. Existing text groups remain in `data`; per-request media receipts are returned separately in `media_lines`, with exact rational quantities and decimal-string amounts. Media lines use at most 100 entries per page; pass `media_next_cursor` as `media_after` until the cursor is null. Text groups repeat on each page. Known media liabilities awaiting a balance debit block issuance. Historical invoice amounts and entries are not rewritten; pre-upgrade text-only invoices continue to occupy their original interval, so retrospective media supplements for an already invoiced interval remain unsupported. Frontend presentation of the added media lines remains integration work. Current-input validation has no positive commercial media records, so the media classification branch remains unverified end to end.

After the pending-count change, the running gateway returned HTTP 200 and zero unresolved/unpriced requests for a workspace with 177 independently observed dispatched personal requests. This verifies that existing owner-funded traffic remains excluded; it does not verify the absent commercial media branch.

Migration 0219 and the media invoice API checkpoint are documented in [media invoice integration](../reference/media-invoice-integration.md). Positive media charging and pagination-backlog qualification remain open.

The external-payment write guard uses immutable attempt/account bindings rather than the presence of a debit, so a recovery worker cannot race a new full-payment record. Existing matching payment-reference retries remain idempotent. The isolated credit workflow subsequently verified balance-bound rejection against an actual invoice. Successful external invoice-payment recording remains unverified.

On 2026-10-10 the rebuilt gateway rejected an empty payment reference (HTTP 400), a nonexistent invoice (409) and an inference-key payment write (401). Independent reads showed no payment-ledger change; the temporary key was revoked. These are input/authorization observations, not evidence for positive receivable settlement or the balance-bound branch.

Atomic admission pins the balance account and reserves against it in one transaction. Reservation uses `FOR NO KEY UPDATE` to serialize spending without upgrading the foreign-key key-share locks into a deadlock. A [four-request, two-gateway current-input run](../reference/key-spending-multi-instance-live.md) verified one exact debit and three key-cap rejections, including persistence after restart. This is a bounded concurrency observation, not a throughput result.

Migration 0220 aligns workspace/key reservation and limit guards, plus media debit capacity enforcement, with the application account lock mode. The [cross-workspace contention run](../reference/company-credit-concurrency-live.md) found that application-only locking was insufficient, then verified four waiting admissions under shared company credit after the trigger correction. No financial predicate or historical entry changed.
