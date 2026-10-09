# Customer billing verification

Development checkpoint, 2026-10-02. This verifies one bounded, nonstreaming text request; it does not close F03–F07.

## Real request reconciliation

The test used the available legacy `google/gemini-2.5-flash` route with an explicitly published customer tariff: USD 0.30 input and USD 2.50 output per million tokens. These test selling rates match the inspected [OpenRouter public model page](https://openrouter.ai/google/gemini-2.5-flash); they are not inferred from procurement costs or a discounted agreement. Existing customer rates were checked before publication and no differing tariff was overwritten.

A temporary model-scoped key sent one synthetic text request through `/v1/chat/completions`, with a 64-token output limit and payload logging disabled. Upstream reported seven input tokens and one output token. The independent customer charge was 4,600 USD nanounits (USD 0.0000046).

- Stored customer charge, authorized Logs status/token counts/amount, and invoice line items agreed.
- The invoice covered exactly one request. Replaying creation with the same idempotency key returned the same invoice.
- The customer Logs response contained no Supplier/procurement/margin fields.
- The temporary key was revoked after the request. Saved Supplier credentials and existing keys were preserved.
- The rendered Billing balance, invoice total, model rates and invoice details agreed with the API results.

## Invoice presentation

The invoice list and details no longer display internal invoice or rate-revision identifiers. Billing period, amount, status, model, token counts and applied customer rates remain available. The line-item amount appears beside the model so it remains visible at the inspected 743-pixel width. This follows the date/amount/actions pattern inspected in OpenRouter Credits transaction history, while retaining Niu's customer invoice semantics.

Three Billing interaction tests and TypeScript checks passed. The regression checks that rate revisions remain internal while charges and scoped detail loading still work.

## SDK invoice workflow

The JavaScript SDK exposes workspace-authorized invoice line reads and installation-only invoice creation/external-payment recording. Invoice creation preserves the caller's idempotency key; conflicts and authorization failures propagate without automatic replay. Input validation covers bounded time ranges, UUID routing values, exact rates and payment-reference byte/control-character limits. External-payment recording does not execute a payment.

All 46 SDK tests passed, including invoice conflict/no-retry, exact line amounts beyond JavaScript's safe integer range, scoped routes, cancellation, invalid inputs and financial-write authorization errors. The read-only `inspect-billing.mjs` example reconciled the real development invoice with exact integer arithmetic and omitted identifiers/payment references. It also ran successfully from an isolated extraction of a freshly packed SDK, with invoice declarations and the example included in the tarball. This qualifies that SDK package/example path against the development server, not the full container distribution.

## API documentation

The five billing routes are included by the main OpenAPI contract. Every billing operation now declares bearer authentication explicitly, so external path-item references retain the requirement. Invoice creation/payment and tariff publication have typed success responses; invoice lines require counts and amounts. Invoice interval documentation matches the implementation's inclusive start/exclusive end, and payment-reference documentation preserves the UTF-8 byte limit.

All 133 checked references in the main and billing contracts resolved across five files. Documentation checks reported no errors/warnings, the static documentation build passed, and the customer billing section was inspected in the running `/help/reference/api/` page. Existing Astro/Vite directive warnings remain build warnings rather than evidence of a clean warning gate.

## Read-only reconciliation checkpoint — 2026-10-03

The current development API's populated billing overview was read without configuration or inference writes. Exact response-field checks found only customer balance, tariff and invoice fields; invoice-line fields contained customer rates, usage and charges, with no Supplier expenses or margins. Charged balances exactly equaled unbilled plus due plus paid amounts. The one saved invoice reconciled exactly to its line amounts, and its single-request line agreed with the pinned customer input/output rates using integer arithmetic. One tariff was present. This is explicit single-invoice coverage, not evidence of multi-invoice pagination or every customer's data.

The PostgreSQL billing regression passed again, covering immutable rate revisions, pinned attempt pricing, duplicate accrual and invoice issuance, unresolved-usage rejection, payment-reference conflicts and foreign-workspace invoice/payment rejection. The live read used installation authorization; prior ordinary-role evidence remains separate. No saved keys, Supplier credentials, tariffs, invoices or payments were changed. Full F05 and packaged/UI qualification remain open.

## Responsive Billing checkpoint — 2026-10-03

The populated development Billing page was inspected at confirmed 390-, 768- and 1280-pixel widths. On phones, the invoice status appears beneath its billing period and the amount and View details action remain visible without horizontal scrolling. Model, input rate and output rate also remain visible together. The invoice dialog opened and closed successfully at 390 pixels; its model and exact line amount remain visible while additional line columns can be scrolled horizontally. The desktop invoice columns remain separate. None of these viewports had document-level horizontal overflow.

This follows the inspected OpenRouter Credits date/amount/actions history pattern while preserving customer invoice semantics. The three Billing interaction regressions and dashboard TypeScript check passed. This verifies this populated single-invoice layout, not all role, empty/error, large-data or payment workflows.

## Remaining acceptance

Broader responsive states and workflows remain open. Restart/recovery, broader role and isolation checks, multiple rate revisions and real multi-model/protocol workflows remain separate requirements. The legacy route has no qualified Supplier offer, so this test does not verify Supplier settlements or commercial rights. No payment was recorded, no real invoice was sent, and no discount claim was established.
