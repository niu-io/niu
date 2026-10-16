# Unused noncash gift correction

Current-input verification: 2026-10-16.

Platform administrators can correct the full original amount of a wholly unused
noncash gift. The original positive adjustment and grant remain immutable. A
separate negative balance adjustment and correction journal commit atomically,
with the original grant, exact amount, authenticated administrator, reason and
company-scoped idempotency key. The opposite noncash memorandum cancels the
original gift source; it is not a receipt, merchant refund, consumption refund,
sales allowance or revenue entry. Credit policy is unchanged.

This initial contract conservatively refuses accounts with paid request history,
consumption, refunds, outstanding reservations or unknown financial sources.
Partial corrections and corrections of consumed gifts are outside this contract.
An original grant permits one full correction. Exact retries return that record;
a changed key cannot create another correction of the same grant. An unknown
response requires a saved-record read or an exact original retry, never a new
balancing gift. Metadata reads alone do not prove an in-flight write failed.

## Actual workflow and independent records

A new isolated company received three actual administrator grants through the
normal HTTP API. The compiled SDK corrected one; simultaneous requests corrected
another exactly once; the dashboard explicitly corrected the third. A separate
minimum-unit grant exercised a named platform administrator after the conservative
request-history guard was applied. That temporary platform grant was removed,
the member revoked, and its session subsequently returned 401.

Independent ledger and memorandum reads matched all original gifts to their
corrections and exact negative adjustments. The resulting balance and explicit
gift pool were both zero, financial source coverage remained known and approved
credit was unchanged. No cash receipt, consumption allocation, customer charge
or invoice payment was created by this workflow. The posting-period financial
summary retained gross issuance and separately reported corrections, with zero
cash receipts, consumption refunds and recognized revenue in the observed window.
No original financial row was deleted or reclassified.

Actual partial/excessive corrections, changed idempotency intent and a second
correction were refused. A separate gift backing an actual unresolved external
request could not be corrected; its existing hold remained. Ordinary workspace
Owner reads and writes returned 403 on the new platform endpoints. Saved
corrections appeared in platform audit history with named company/currency and
administrator context; source-qualified pagination advanced normally.

Desktop and narrow browser checks covered original amounts, explicit confirmation,
persisted correction details, horizontal access to history actions, issued-gift
versus saved-intent tabs, and the financial statement's separate correction memo.
The dialog uses the existing Niu account-management pattern and installed shadcn
primitives; the inspected Stripe customer-balance documentation provides the
immutable reversing-transaction reference. No upstream URL, credential or internal
reference is used as a product label.

This does not qualify consumed-gift correction, partial correction, merchant
funding/refunds or broader accounting closure. Fixture outcomes supply no evidence.
