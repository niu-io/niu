# Payment merchant access checkpoint — 2026-10-09

An authenticated server-side query was sent to the configured payment merchant's
actual `queryOutOrder` endpoint using the saved private credentials. It queried
a new diagnostic reference, not an existing customer's order, and created no
payment or funding record. The provider returned HTTP 200 with `success=false`,
business code 6003 and an explicit lack-of-query-permission response. Rechecking
after the owner reported completed personal identity verification produced the
same result.

HTTP 200 is not payment acceptance. Personal identity verification and order-query
authorization are separate: the [official query documentation](https://docs.zhifux.com/read/zhifufm/querybyoutno)
requires separately enabled query access. Current query recovery is unverified
and requires that merchant-side entitlement. This does not establish whether
checkout is enabled or whether any customer payment method is qualified.

The provided private configuration includes merchant credentials and API/checkout
origins, but not qualified payment-method identifiers or a public notification
endpoint for this development gateway. No configuration was invented and no
funding was credited. Merchant details, signed requests and raw responses remain
outside the public repository. Live checkout, verified payment, callback replay,
restart reconciliation and customer deductions remain open.

## Transport diagnosis

The production Rust payment transport was subsequently exercised against the
same actual merchant endpoint and diagnostic reference. It now returns the
typed `Rejected { code: 6003 }` error rather than treating a business rejection
as malformed response data. The output contains only the numeric code and a
fixed message; the upstream message, request signature and merchant details are
not forwarded. Rejected envelopes are classified before decoding successful
order data, and cannot produce verified payment evidence.

Installation reconciliation maps this code to a fixed query-access explanation
and logs only the numeric rejection code. Other failures retain the unresolved
order response. No rejection closes an order, establishes a provider order
identity or grants funds. The gateway reconciliation branch has not yet been
exercised with a real saved merchant order; this run verifies only the real
transport rejection path. Checkout, paid evidence and end-to-end reconciliation
remain unverified.

Compilation and lint checks were executed for the payment and gateway crates.
No fixture-test outcome is used as evidence.
