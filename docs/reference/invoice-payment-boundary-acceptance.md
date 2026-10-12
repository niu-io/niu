# Invoice, reversal and unpaid payment boundaries

Three actual native HTTP checkpoints on digest-pinned runtime `c24e75b7f3176f35faa571ea1fca6574c6de050e` clarify S05-3/S06-3's supported mechanisms and remaining positive-evidence limits. Each used an isolated copy of a stopped saved PostgreSQL database and independent final database reopening. No new inference, commercial qualification, Supplier earning, cash receipt or paid notification was fabricated.

## Real customer invoice and export

The source retained twelve actual protocol requests with exact customer charges totaling 132,227 nanounits, including genuine Messages usage supplementation. Current HTTP invoice creation selected those charges. An identical idempotency replay returned the same invoice; changing the period under that key returned 409. A viewer could read but could not issue (403). Foreign company reads were 404; the customer procurement endpoint was 403.

Four customer invoice lines totaled 132,227 nanounits and retained the original immutable rates, nullable category quantities, fee fields and currency. Independent verification matched each line's quantities and amounts to native charges and its rates/fees to the original tariff revision. The complete twelve-row customer request CSV totaled the same amount. No Supplier procurement fields appeared in the inspected customer JSON or CSV headings.

History reported the invoice as paid because the twelve customer debits were already posted under the exercised internal-credit workflow. This did not create a cash receipt or invoice payment receipt. Restart preserved lines and replay identity. Original attempt/financial fingerprints remained unchanged; twelve invoice entries linked the existing charges. Temporary readers were revoked.

## Posted customer-charge reversal

A separate stopped copy reversed one existing real 19,260-nanounit customer debit through the installation-only balance-entry reversal API. An ordinary company owner received 403. Exact replay and replay after restart retained one refund entry; changed replay and an additional over-refund returned 409. The account balance increased by exactly 19,260 nanounits.

Independent reopening confirmed the original debit remained, all twelve original charges still totaled 132,227, and all financial records other than the one new refund entry retained their fingerprints. Historical invoice lines remained unchanged. This is a customer account reversal, **not a processor cash refund**. The supported payment integrations still advertise no refund initiation capability.

## Genuine saved merchant, unpaid intent and negative callbacks

A third stopped copy retained a genuine saved Zhifux merchant intent from an earlier failed checkout creation attempt. Its state was `reconciliation_required`; payment had never been requested. Current HTTP identical replay and restart returned the original intent without another checkout submission. Changed amount returned 409; unsupported USD and sub-fen amount returned 400.

Fifteen current HTTP cases exercised status/replay and hostile notifications using the privately saved real merchant configuration. Signed wrong amount, signed wrong merchant, signed nonpaid state, invalid signature and duplicate invalid signature were refused with 400; a signed unknown order was 404. Invalid signatures remained refused after restart. No valid paid notification was sent. The normal background recovery may perform read-only merchant queries for the existing unpaid order; it does not submit checkout again.

Independent artifact-digest and native checks confirmed one original creation claim, zero notification receipts or settlements for that order, and unchanged balance/funding/notification/settlement fingerprints. These results verify negative protections, not receipt of money or a successful merchant payment. Merchant rejection does not imply that personal identity verification failed.

## Fixed remaining evidence

| Area | Implemented or verified boundary | Remaining positive evidence |
| --- | --- | --- |
| Customer invoice | Actual existing text/protocol charges, historical serialization, exact export, permissions, replay and restart verified. | Positive paid-media invoice lines are not established by empty `media_lines`. |
| Supplier earnings/settlements | Declared interfaces and review/activation mechanisms exist; customer serialization excludes procurement. | Nonempty accrual/settlement with genuinely authorized reviewed commercial supply remains unverified; no artificial approval or earning is created here. |
| Customer account reversal | One real posted charge reversed exactly once in a copied database, without altering original charges or invoice history. | This does not verify merchant cash refunds. |
| Payment funding | Genuine unpaid saved-intent replay and signed hostile-input refusal verified. | Positive received-cash funding and successful paid callback/query settlement remain unverified. External merchant activation is separately tracked, not a prerequisite for implementing the integration capability. |

The authoritative interface inventory is [payment capabilities](payment-capability-matrix.md); customer accounting evidence is [the accounting matrix](accounting-matrix-acceptance.md). These bounded checkpoints do not, by themselves, close all S05-3/S06-3 combinations. Fixture outcomes provide no acceptance signal.
