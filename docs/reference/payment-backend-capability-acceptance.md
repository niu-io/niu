# Current payment backend capability acceptance

This records actual posted-charge refund evidence toward S06-3. Funding/callback closure is unverified pending nonfixture evidence. Its fixed criterion is unchanged:

> Establish supported funding/refund transitions and negative callback/idempotency protections from actual evidence; merchant activation is not a completion prerequisite.

Backend readiness concerns the supported integration contracts and Niu's durable behavior. An external operator's activation or a successful live payment is not a readiness prerequisite. Pending orders, rejected notifications and locally constructed checkout URLs do not become received cash.

The supported-method inventory is [EPay, Stripe and native Zhifux](payment-capability-matrix.md). All three truthfully advertise no external refund initiation. The supported refund in this checkpoint is an installation-authorized customer ledger reversal. It preserves the original debit and never calls a processor or bank. Broader signed-notification protections retain their actual scopes in [the invoice/payment boundary evidence](invoice-payment-boundary-acceptance.md) and [the prior local capability evidence](payment-local-capability-acceptance.md).

## Pinned current execution

Both runs use retained Gateway `ef29c2929ceba22bc590faa8787946dbb78b62b5`, binary SHA-256 `8982dda8bd5c09ed7132fec199f772120ef8ca1391bee85f6afb37aeecd3f267`, and compiled JavaScript SDK `6f6c48a3b892e35a7c14a05bc4a48ea4d5416028`.

The runs use separate stopped native database copies. The unpaid-order copy migrates schema 287 to 293; the existing-charge copy migrates schema 284 to 293. Original databases, deployment configuration and encryption identity are untouched. Payment handlers, configuration, top-up storage and adapter source remain unchanged from the earlier `4c3def63` checkpoint to this exercised revision; no missing payment facility or backend defect is inferred from absent merchant activation.

The real posted-charge refund is independently verified against actual native responses and reopened final PostgreSQL records. It makes no merchant request or external refund and creates no cash receipt.

## Excluded fixture merchant workflow

The unpaid EPay command was executed. Its merchant configuration uses a reserved `.invalid` checkout URL. Its fixture outcomes, including HTTP responses, counts, replay and persistence, are disregarded for diagnosis, correctness, prioritization and readiness. They do not contribute S06-3 acceptance evidence. Nonfixture funding/callback evidence remains to be established from genuine saved configuration and order state.

## Refund of an existing actual charge

The source retains actual customer charges from an earlier approved-credit inference workflow. The current run selects a genuine posted debit with remaining refund allowance; no new charge or cash receipt is created.

The compiled SDK refunds its exact remaining 20,371 nanounits through `reverseCustomerBalanceEntry`. Identical replay and replay after restart return HTTP 200 and preserve one refund identity. Changed reuse and an additional over-refund return 409. A company owner is refused with 403; the revoked owner's stale session is refused with 401.

Independent reopening confirms exactly one new positive `refund` entry linked to that original debit, with the same company account and currency. Every original entry and charge remains unchanged. Cumulative refunds equal the original debit, and the account's signed ledger sum increases by exactly 20,371 nanounits. All other whole financial/request fingerprints remain unchanged. The temporary owner is revoked and both isolated Gateways and PostgreSQL copies are stopped.

The resulting credit is an internal ledger refund, not a cash return or payment-processor refund.

## Scope and remaining evidence

The genuine current run verifies an installation-only refund of an actual posted charge, exact arithmetic, immutable original entries, idempotency, over-refund protection, permission refusal and restart. It does not verify funding-entry reversal or a payment processor refund.

The supported inventory remains EPay, Stripe and native Zhifux, with external refund initiation explicitly unsupported. Merchant activation or a successful external payment is not a backend-readiness prerequisite. That policy does not turn fixture merchant input into acceptance evidence: the current funding/callback closure still requires nonfixture current-input verification.

No paid callback, received-cash settlement or funding receipt is fabricated. The S06-3 identifier and criterion are unchanged, and the checkpoint remains unverified beyond the genuine posted-charge refund scope documented here.
