# Current payment backend capability acceptance

This records actual posted-charge refund and genuine saved-intent negative-protection evidence toward S06-3. Its fixed criterion is unchanged:

> Establish supported funding/refund transitions and negative callback/idempotency protections from actual evidence; merchant activation is not a completion prerequisite.

Backend readiness concerns the supported integration contracts and Niu's durable behavior. An external operator's activation or a successful live payment is not a readiness prerequisite. Pending orders, rejected notifications and locally constructed checkout URLs do not become received cash.

The supported-method inventory is [EPay, Stripe and native Zhifux](payment-capability-matrix.md). All three truthfully advertise no external refund initiation. The supported refund in this checkpoint is an installation-authorized customer ledger reversal. It preserves the original debit and never calls a processor or bank. Broader signed-notification protections retain their actual scopes in [the invoice/payment boundary evidence](invoice-payment-boundary-acceptance.md) and [the prior local capability evidence](payment-local-capability-acceptance.md).

## Pinned current execution

Both runs use retained Gateway `ef29c2929ceba22bc590faa8787946dbb78b62b5`, binary SHA-256 `8982dda8bd5c09ed7132fec199f772120ef8ca1391bee85f6afb37aeecd3f267`, and compiled JavaScript SDK `6f6c48a3b892e35a7c14a05bc4a48ea4d5416028`.

The runs use separate stopped native database copies. The unpaid-order copy migrates schema 287 to 293; the existing-charge copy migrates schema 284 to 293. Original databases, deployment configuration and encryption identity are untouched. Payment handlers, configuration, top-up storage and adapter source remain unchanged from the earlier `4c3def63` checkpoint to this exercised revision; no missing payment facility or backend defect is inferred from absent merchant activation.

The real posted-charge refund is independently verified against actual native responses and reopened final PostgreSQL records. It makes no merchant request or external refund and creates no cash receipt.

## Excluded fixture merchant workflow

The unpaid EPay command was executed. Its merchant configuration uses a reserved `.invalid` checkout URL. Its fixture outcomes, including HTTP responses, counts, replay and persistence, are disregarded for diagnosis, correctness, prioritization and readiness. They do not contribute S06-3 acceptance evidence. The genuine saved-configuration run below supplies a separate nonfixture scope; no fixture outcome contributes to it.

## Refund of an existing actual charge

The source retains actual customer charges from an earlier approved-credit inference workflow. The current run selects a genuine posted debit with remaining refund allowance; no new charge or cash receipt is created.

The compiled SDK refunds its exact remaining 20,371 nanounits through `reverseCustomerBalanceEntry`. Identical replay and replay after restart return HTTP 200 and preserve one refund identity. Changed reuse and an additional over-refund return 409. A company owner is refused with 403; the revoked owner's stale session is refused with 401.

Independent reopening confirms exactly one new positive `refund` entry linked to that original debit, with the same company account and currency. Every original entry and charge remains unchanged. Cumulative refunds equal the original debit, and the account's signed ledger sum increases by exactly 20,371 nanounits. All other whole financial/request fingerprints remain unchanged. The temporary owner is revoked and both isolated Gateways and PostgreSQL copies are stopped.

The resulting credit is an internal ledger refund, not a cash return or payment-processor refund.

## Genuine saved Zhifux intent and disabled automatic queries

A separate run uses Gateway `8bfdef10003eebe9402401247aa52cd69d3a398f`,
binary SHA-256 `6f5290d182c9bf51de1f2bb8d469067351c9f9771150235adc2917b1d39c6900`,
and compiled SDK `ce97f3b0116570dfd2a487b802d2d2de18efbf39`. It restores a
stopped native copy containing an actual uncertain Zhifux intent. The merchant,
secret, API root and checkout origins exactly match the user's saved real merchant
configuration. No reserved fixture merchant endpoint is substituted.

`NIU_PAYMENT_POLLING=false` suppresses automatic merchant queries. No explicit
merchant reconciliation, checkout resubmission or processor call is performed.
An actual native startup with an invalid flag refuses initialization with a
sanitized error before database/payment runtime loading. The default enabled
behavior and callbacks/manual reconciliation contracts are preserved.

Twelve actual HTTP exchanges cover truthful integration inventory and payment
methods; saved uncertain detail and history; identical creation replay; changed
amount refusal (409); unsupported currency and sub-minor-unit refusal (400);
two unsigned nonpaid callback refusals (400); and unchanged detail/replay after
Gateway restart. Replay returns the saved uncertain intent, not a new checkout
or paid state. The sub-minor-unit case uses raw HTTP because the current SDK
rejects that amount locally; the local guard is not server-execution evidence.

Independent reopening checks all response digests and nineteen complete native
table fingerprints. Financial/request tables, the original order and its single
creation claim, checkout/provider bindings, notifications, settlements, closures,
configuration/events, query limits and vendor/model rows remain unchanged.
No funding receipt, balance credit, payment query claim or generation is added.
Both Gateway and PostgreSQL are stopped after verification. Original database,
configuration and encryption identity remain untouched.

## Scope and remaining evidence

The genuine current run verifies an installation-only refund of an actual posted charge, exact arithmetic, immutable original entries, idempotency, over-refund protection, permission refusal and restart. It does not verify funding-entry reversal or a payment processor refund.

The supported inventory remains EPay, Stripe and native Zhifux, with external refund initiation explicitly unsupported. Merchant activation or a successful external payment is not a backend-readiness prerequisite. The genuine saved-intent run verifies unpaid-state preservation, replay and unsigned callback refusal under the supported merchant configuration. Fixture merchant outcomes remain excluded.

No paid callback, received-cash settlement or funding receipt is fabricated. The S06-3 identifier and criterion are unchanged, and the evidence is limited to the genuine posted-charge refund and saved-intent negative scopes documented here. Positive paid/closed settlement, funding-entry reversal and external processor refunds remain unverified or unsupported as specified; successful merchant activation is not imposed as a readiness prerequisite.

## Finite backend completion boundary

S06-3 completes the supported backend capability boundary, rather than requiring every merchant account to accept a live payment. The genuine saved-intent replay, amount/currency refusal, unsigned callback protection and restart observations above, the [genuine signed hostile-notification refusals](invoice-payment-boundary-acceptance.md), and the actual posted-charge ledger refund qualify their stated scopes. Reserved fixture merchant outcomes remain excluded.

Committed source inspection separately establishes the implemented funding and closure mechanisms: verified evidence must match the immutable saved merchant/order, provider reference and exact amount; funding entry, unique receipt and settlement commit atomically once; verified closure creates no funding; pending or uncertain checkout is not spendable. These are implementation findings, not observed positive cash settlement or successful signed paid notification. Payment handlers, adapters and top-up storage have no source delta from the exercised `8bfdef10` checkpoint in this consolidation.

The [published three-integration inventory](payment-capability-matrix.md) defines the finite limits. External refund initiation is unsupported for EPay, Stripe and Zhifux. EPay query recovery returns 501; its signed notifications remain supported. Stripe reconciliation uses an already bound session and does not recreate uncertain, unbound checkout creation. Zhifux notification acknowledgement alone does not fund an account; independent verified query evidence is required.

Positive paid/closed settlement, a valid signed paid callback, received-cash funding and funding-entry reversal remain **unverified**. The supported installation-authorized reversal actually exercised here refunds an existing posted customer debit; it is not a processor refund or bank transfer. These limitations remain visible after finite backend completion and must not be relabeled as successful external activation. No additional merchant call, cash record, source fix or fabricated approval was required by this consolidation.
