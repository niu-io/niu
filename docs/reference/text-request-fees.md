# Customer text request fees

Customer tariff publication accepts optional `request_fee_nanos`, an exact
nonnegative integer string up to 9,223,372,036,854,775,807. New and historical
tariffs default to zero. Replacing a nonzero fee requires an explicit value;
`"0"` disables it. Null, fractional, negative and overflowing values are invalid.
This field belongs to customer selling prices, not Supplier purchase terms.

For a completed request with known required usage categories:

```
charge = max(rounded_token_charge + request_fee_nanos, minimum_charge_nanos)
```

Token pricing still rounds the combined exact token amount upward once. The
integer fixed fee is added afterward, then the minimum is applied to the combined
amount. Admission applies the same rule to its conservative token bound. Company,
workspace and key spending capacity must cover the resulting reservation even
when token rates are zero. Checked addition rejects overflow; it never wraps or
silently caps a charge. The database dispatch guard also excludes nonzero-fee
requests from its zero-price exception.

Immutable tariff and operation bindings preserve historical prices. Confirmed
nonexecution and unresolved execution/usage do not create fixed fees. A failed
predecessor in the bounded Chat failover chain therefore has no fee; a qualifying
completed successor uses the operation's original fee. Existing unknown-usage
reservations remain unresolved rather than converting the fee into a guessed
charge. Personal-key routes retain their separate funding behavior.

Billing tariff reads and invoice lines return `request_fee_nanos` as a string.
The JavaScript SDK validates the exact string without conversion to a JavaScript
number. Existing minimum-only storage callers remain compatible, but cannot
silently remove a previously configured nonzero fee.

This implements a fee on known completed text attempts. It does not introduce
submission fees, charges for rejected requests, a fee on uncertain executions,
Supplier fee schedules or customer-funded video pricing.

## Current-input verification

A fresh native gateway/database run used actual OpenRouter completions with
explicit internal credit and test retail rates. Four requests exercised fixed-only
pricing, token-plus-fee pricing, a minimum above the combined amount and explicit
fee disablement. The four charges totaled 2,045,679 nanounits. Independent saved
provider-response arithmetic matched the exact charges and balance debits;
historical tariff bindings and released holds survived restart. A cap below the
fixed-only fee rejected dispatch before an attempt was sent. Invalid fee strings
and omission of an existing nonzero fee were rejected without changing the tariff.

A separate actual pool run exercised buffered and streamed Chat, each following
one real authentication rejection. Only the successful successor was charged,
including exactly one 12,345-nanounit fee. Failed attempts and an exhausted
rejection chain had no fee. The invoice retained the two completed charges through
idempotent replay and restart. Price changes between attempts retained the
operation's original tariff; the exercised fee value itself stayed constant.

The built JavaScript SDK published `9007199254740993` through the actual API.
Independent SQL and billing reads retained that exact string; explicit zero
restored the current fee while previous charges stayed unchanged. A null field
was rejected by typed JSON validation. No cash receipt or commercial Supplier
qualification was fabricated. These runs used the owner's personal upstream
account for internal accounting verification.

Fee-specific cached usage, crash/uncertain usage and bounded-capacity contention
remain open. Shared implementation or earlier minimum-only evidence is not
evidence that those fee paths passed.


### Refund, Responses and mixed-protocol verification

The retained actual fixed-only charge of 1,000,000 nanounits was refunded through
the administrative API. Two concurrent identical 600,000-nanounit refund requests
created one entry; a further 500,000 was refused as excessive. A final 400,000
refund restored exactly 1,000,000 of key allowance. Original charge history and
the four-line invoice, including fixed-fee fields, stayed unchanged through
restart and replay. This is an internal charge reversal, not a bank refund.

A fresh Responses run exercised buffered and streamed completions with a
12,345-nanounit fee per completed request. Independent saved terminal-response
usage matched each token-plus-fee charge. Actual zero-credit refusal, exhausted-key
refusal, invoice issuance, idempotent refund and restart checks retained their
expected accounting behavior with the fee enabled.

A separate fresh run used four workers and one shared key/account for twelve
actual requests: four Chat, four Responses and four embedding requests. All
charged once with the same fixed-fee schedule. Independent saved-response token
arithmetic reproduced 222,342 total nanounits, including 148,140 fixed-fee
nanounits. Embedding outputs contained 1,536 finite values. SQL matched each
charge/debit and reported token count; no reservation remained, reconciliation
matched, and restart preserved the total and entry counts. This is concurrent
workflow evidence, not saturation or limited-balance contention qualification.

All runs used explicitly approved internal credit and personal upstream testing,
with no received-cash receipt or commercial Supplier qualification. Isolated
processes were stopped after verification.
