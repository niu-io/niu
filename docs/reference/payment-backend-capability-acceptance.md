# Current payment backend capability acceptance

This records the current actual S06-3 capability checkpoint. Its fixed criterion is unchanged:

> Establish supported funding/refund transitions and negative callback/idempotency protections from actual evidence; merchant activation is not a completion prerequisite.

Backend readiness concerns the supported integration contracts and Niu's durable behavior. An external operator's activation or a successful live payment is not a readiness prerequisite. Pending orders, rejected notifications and locally constructed checkout URLs do not become received cash.

The supported-method inventory is [EPay, Stripe and native Zhifux](payment-capability-matrix.md). All three truthfully advertise no external refund initiation. The supported refund in this checkpoint is an installation-authorized customer ledger reversal. It preserves the original debit and never calls a processor or bank. Broader signed-notification protections retain their actual scopes in [the invoice/payment boundary evidence](invoice-payment-boundary-acceptance.md) and [the prior local capability evidence](payment-local-capability-acceptance.md).

## Pinned current execution

Both runs use retained Gateway `ef29c2929ceba22bc590faa8787946dbb78b62b5`, binary SHA-256 `8982dda8bd5c09ed7132fec199f772120ef8ca1391bee85f6afb37aeecd3f267`, and compiled JavaScript SDK `6f6c48a3b892e35a7c14a05bc4a48ea4d5416028`.

The runs use separate stopped native database copies. The unpaid-order copy migrates schema 287 to 293; the existing-charge copy migrates schema 284 to 293. Original databases, deployment configuration and encryption identity are untouched. Payment handlers, configuration, top-up storage and adapter source remain unchanged from the earlier `4c3def63` checkpoint to this exercised revision; no missing payment facility or backend defect is inferred from absent merchant activation.

Twenty-two recorded current SDK/HTTP requests exercise the following paths. There are no merchant calls, external refunds, paid callbacks, invented funding receipts or new generations. Verification uses actual native Gateway responses and independent reopening of each final PostgreSQL database. Fixture outcomes provide no evidence.

## Existing unpaid EPay checkout

The source contains a genuine uncertain Zhifux intent and a previously API-saved, explicitly unactivated EPay checkout. Its reserved `.invalid` checkout URL is never followed.

| Current actual path | Observed result |
| --- | --- |
| Administrator integration inventory | Three supported integrations; all external refund-initiation flags are false. |
| Configured company payment methods | Existing CNY EPay checkout methods are discoverable; this describes local configuration, not merchant approval. |
| Saved order and history | HTTP 200 with the original pending order. No merchant contact or funding occurs. |
| Identical SDK creation replay | Original order and checkout projection remain identical. |
| Changed amount under the same identity | HTTP 409. |
| EPay reconciliation | HTTP 501, faithfully reflecting the unsupported query mechanism. |
| Two unsigned nonpaid callbacks | HTTP 400, never a successful payment acknowledgement. |
| Restart and replay | Original order remains pending; replay is stable and reconciliation remains 501. |

Independent final reopening confirms exactly two orders, one original creation claim and one local checkout. Provider-order identities, notifications, settlements, closures and funding receipts remain zero. Complete payment/configuration fingerprints and seven whole financial/request fingerprints remain unchanged. Customer projections omit merchant credentials, internal provider identities and procurement fields.

This verifies pending recovery and funding-admission refusal. It does not exercise successful received-money settlement or manufacture a paid/closed state.

## Refund of an existing actual charge

The source retains actual customer charges from an earlier approved-credit inference workflow. The current run selects a genuine posted debit with remaining refund allowance; no new charge or cash receipt is created.

The compiled SDK refunds its exact remaining 20,371 nanounits through `reverseCustomerBalanceEntry`. Identical replay and replay after restart return HTTP 200 and preserve one refund identity. Changed reuse and an additional over-refund return 409. A company owner is refused with 403; the revoked owner's stale session is refused with 401.

Independent reopening confirms exactly one new positive `refund` entry linked to that original debit, with the same company account and currency. Every original entry and charge remains unchanged. Cumulative refunds equal the original debit, and the account's signed ledger sum increases by exactly 20,371 nanounits. All other whole financial/request fingerprints remain unchanged. The temporary owner is revoked and both isolated Gateways and PostgreSQL copies are stopped.

The resulting credit is an internal ledger refund, not a cash return or payment-processor refund.

## Closure assessment and explicit exclusions

The current evidence establishes the exercised supported integration inventory, locally configured checkout, immutable unpaid-order recovery, rejection of unsigned funding claims, installation-only ledger refund, exact idempotency, over-refund protection and restart persistence. Source inspection found no concrete implementation gap requiring another payment channel, external refund API or merchant activation.

Positive received-cash funding, paid/closed reconciliation samples and successful merchant notifications remain externally unverified. They are not claimed by these responses and are not prerequisites for the supported capability-readiness boundary. Stripe session creation and native Zhifux merchant success retain their separately declared evidence limits; this run does not pretend to have activated every integration.

External refund initiation remains unsupported in the public inventory. Funding-entry reversal also requires a legitimate original funding entry; this run supplies none. It proves the actual posted-charge refund branch and preserves the distinction between those ledger transitions and external cash movement.

The fixed S06-3 identifier and criterion are unchanged. This is a scoped backend-capability closure assessment for release review, not a claim that a live payment or every external operator has been qualified.
