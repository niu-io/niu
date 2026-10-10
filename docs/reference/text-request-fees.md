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

Fee-specific cached usage now has [actual combined-price evidence](cached-input-pricing.md#cached-tokens-combined-with-fixed-fees-and-minimums),
including nonzero cache with additive fees and with a dominating minimum. Missing
cache categories, broader failure boundaries and sustained overload remain open.


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


### Shared credit contention and interrupted fixed-fee liability

Two native gateways shared one fresh database and company account. Separate keys
in two workspaces concurrently requested actual model completions with zero token
rates, zero minimum and a fixed fee of 1,000,000 nanounits. Approved internal
credit was exactly 1,000,000. One request completed and the other returned HTTP
402; independent reopened-database inspection found one dispatched attempt and
one matching charge/debit of 1,000,000, with no open holds or funding receipt.
Only the winning workspace reported a charge. After restarting both gateways,
both keys were denied before dispatch because the shared capacity was exhausted.
This verifies that exercised two-request contention, not saturation or every
currency/key/workspace-cap combination.

A separate real streamed request used the same fixed-only tariff and a key cap
of 1,000,000. SIGKILL immediately after the first received content event bypassed
graceful cleanup. Restart retained unknown execution/usage, no charge or debit,
and a 1,000,000-nanounit hold. New dispatch stayed blocked through key rotation
and another restart; revocation did not release the unresolved liability. No
alternative pool credential was sent. Independent inspection parsed the raw SSE
prefix and reopened the database to confirm one unknown attempt and the exact
held amount. This does not establish whether upstream generation finished after
the crash or qualify all failure/commit boundaries.

### Checked addition at admission

A fresh actual API run published the maximum signed-64-bit fixed fee with positive
token rates. Its admission bound could not fit in a signed 64-bit nanounit amount;
Chat admission returned HTTP 400. Setting both token rates to zero made the fee
representable, but available internal credit was insufficient, so admission
returned HTTP 402 before and after restart. Independent SQL found no attempts,
charges, balance entries or customer/procurement reservations from these requests.
No upstream generation was sent. This verifies admission overflow/refusal only;
reported usage exceeding a representable bound remains a separate settlement path.

### Model discovery contract and SDK reads

`GET /v1/models` now has a handler-generated response contract. Its
`customer_pricing.unit` applies only to token rates; minimum and fixed fees are
per-request currency nanounits. Model-list and invoice-line SDK types expose both
optional fields for compatibility with earlier gateways. Discovery reports the
current workspace tariff, not a historical invoice price or an admission guarantee.

An actual retained-database run published a fee of `9007199254740993`, then read
it through both the model endpoint and the built JavaScript SDK. The complete
price field set, minimum and fixed-fee strings matched SQL-backed billing reads.
A separate workspace key could list the same shared alias but received null
customer pricing, not the first workspace's tariff. Restart preserved the first
workspace's response. Temporary keys were revoked and the fee was explicitly
restored to zero without rewriting historical charges. No inference was sent.
