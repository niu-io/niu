# Live financial authorization boundaries

Date: 2026-10-09. The running gateway was exercised using freshly issued
company-owner, company-viewer and workspace-owner credentials against the
existing development organization. These were actual HTTP requests and current
database records, not fixture outcomes.

The company owner could read its company balance and transaction list. Company
viewers and workspace-scoped owners received HTTP 404 for those shared financial
reads. Each credential also received HTTP 404 for another organization's balance.

All three roles received HTTP 403 when attempting to record settled funding,
increase the credit limit, reverse an entry or invoke installation-only order
reconciliation. Funding and credit requests carried positive amounts; the
reversal and reconciliation requests used new nonexistent diagnostic references.
No installation credential was used to manufacture a payment or funding record.

Independent PostgreSQL snapshots of the organization's balance-account rows and
ledger-entry count were identical before and after the requests. The balance and
transaction API responses were also identical. All temporary credentials were
revoked. Private credentials and diagnostic identifiers remain outside Git.

This verifies the exercised authorization boundaries and absence of financial
mutation for those denied requests. It does not establish successful checkout,
paid callback verification, top-up reconciliation, customer request charging,
refund processing or credit admission under concurrent paid requests. Live external payment and commercial-supply outcomes remain unverified; they
are deployment checks, not prerequisites for internal integration capability or
performance work. Internal financial behavior still needs its own evidence. No
fixture-test result is used as evidence.

## Concurrent warning-policy writes on the native release service

An isolated zero-balance CNY company was created through the running
administration API, with a short-lived organization-scoped owner credential.
Eight synchronized real HTTP requests submitted different warning thresholds
using the same current policy revision. Exactly one returned HTTP 200 and seven
returned HTTP 409. The winning nanounit string was greater than JavaScript's
safe integer boundary and matched the subsequent account read exactly; the
policy revision increased once.

Independent PostgreSQL inspection confirmed the exact threshold/revision, one
policy-history entry and zero customer balance entries. Balance, approved credit,
reservations and available capacity all remained zero. The warning was then
explicitly disabled using the current revision, and the owner credential was
revoked. The isolated empty company remains in the development database as an
audit artifact; no existing company policy, funds or encryption identity changed.

This is current-input API and durable-database evidence for optimistic concurrency
and exact warning amounts. It does not demonstrate payment settlement, competing
inference reservations, refunds or commercial charge reconciliation. No merchant
activation or fabricated payment evidence was needed, and no fixture outcome is
used as evidence.

## Unconfigured payment-notification ingress

A current-input HTTP run exercised the running gateway's native PaymentFM,
EPay and Stripe notification endpoints without creating a payment or changing
merchant configuration. Native notification input used a newly generated unknown
order reference; EPay and Stripe requests omitted valid payment signatures. All
three returned HTTP 502 because their notification integrations were unavailable
in this runtime. A native notification exceeding the 8 KiB request-body limit
returned HTTP 413.

Independent PostgreSQL snapshots before and after these requests were identical
for all rows in the order, provider-order binding, settlement, notification,
balance-entry and balance-account tables. This establishes rejection without
financial mutation for this runtime's unavailable-integration paths and the
native body-size limit. It does **not** exercise configured signature validation,
amount matching, paid settlement, or duplicate-payment handling: those checks
must not be claimed from a request rejected before the adapter is available.
External merchant activation remains a deployment check, not an internal release
prerequisite. No fixture result contributes to this observation.

## Checkout authorization before configuration serialization

Checkout creation now performs authentication, billing-account authorization and
currency-format validation before waiting for the payment configuration mutex.
The mutex still protects accepted checkout work from concurrent configuration
changes. Previously even unauthorized requests joined that queue, potentially
waiting behind an upstream checkout operation.

After building and starting the updated optimized gateway, actual checkout POSTs
returned HTTP 401 for an invalid token, HTTP 403 for an organization viewer and
HTTP 400 for lowercase currency submitted with installation authorization. The
balance API response remained unchanged. An independent PostgreSQL query found
zero top-up orders after these requests. The temporary viewer was revoked.
Formatting and release compilation completed. This run verifies rejection on the
updated binary; it does not measure latency under a held configuration lock or
establish upstream checkout/settlement acceptance.

## Amount errors remain client errors without an enabled integration

Actual checkout submissions on the preceding binary returned HTTP 502 for `-1`,
`0`, `1.5`, and an integer above the signed 64-bit maximum because integration
selection preceded amount validation. Checkout now validates positive ASCII
integer nanounits within the supported range before configuration locking and
adapter selection. Currency-specific minor-unit rules remain adapter-specific.

On the rebuilt optimized gateway, empty, negative, zero, fractional, overflowing,
space-prefixed, plus-prefixed and non-ASCII-digit amounts each returned HTTP 400.
The balance API response remained unchanged, and an independent PostgreSQL read
confirmed zero top-up orders. Invalid-token, viewer and lowercase-currency
requests still returned 401, 403 and 400 respectively. This verifies invalid-input
handling; it does not establish successful funding or reconciliation.

## Payment-method contract validation

The checkout endpoint now enforces the published payment-method identifier
contract before integration selection: 1–64 ASCII alphanumeric, dot or hyphen
characters. On the updated optimized gateway, actual submissions containing an
empty identifier, 65 characters, whitespace, slash, Chinese characters or a
newline returned HTTP 400. Balance reads were unchanged and independent
PostgreSQL reads confirmed zero top-up orders. The eight invalid-amount requests
were repeated on this binary and again returned HTTP 400 without creating orders.

The JavaScript SDK's checkout description and amount error now refer to supported
currencies instead of incorrectly describing all top-ups as CNY-only. Existing
Stripe support remains USD/CNY; this change adds no currency or merchant support.
SDK type checking/build and gateway release compilation completed. These checks
do not establish successful payment collection.

## Personal inference with a zero customer spending limit

A new workspace under the existing personal-credential owner's organization was
created through the running API. Every available customer spending-account
currency was assigned an explicit zero workspace limit. A newly issued key was
restricted to the existing personal model alias, and an actual short OpenRouter
chat request returned HTTP 200 with nonempty content. An independent PostgreSQL
read confirmed exactly one completed attempt in that workspace.

The company balance API response and workspace limits/committed amounts were
identical before and after inference. The temporary key was revoked. The new
workspace, zero-limit configurations and request remain as audit records.

This verifies the separation between owner-funded upstream inference and customer
retail spending limits for this request. It does not demonstrate admission or
settlement of a commercially billed request at a zero limit, concurrent paid
reservations, or per-key monetary caps. Current API-key controls cover model
permissions, expiry and revocation; workspace customer spending limits must not
be described as per-key monetary limits.

## Saved request detail and customer CSV consistency

For the actual personal inference above, a newly issued workspace-scoped viewer
read the request detail and CSV export through the running gateway. Both reported
11 input tokens and 2 output tokens, matching the previously captured upstream
response. An independent PostgreSQL read of that attempt confirmed those exact
token counts and `confirmed_completed` execution.

The parsed CSV contained one request, a nonnegative observed duration and complete
timing metadata. Customer currency and charge fields were empty for this personal
request; the CSV header contained no Supplier, procurement or margin fields. The
viewer credential was revoked after inspection. These observations establish
consistency for the exercised successful request, not every error, streaming,
media or commercially charged export case.

## Concurrent checkout configuration readers

The gateway's payment configuration guard is now a read/write lock. Checkout
requests retain a shared read guard through configuration selection and order
creation; administrative merchant configuration changes require a write guard.
Previously one mutex serialized every company's checkout, including time spent
waiting on an upstream service. Existing database order identity, creation-claim
and pending-order configuration checks remain in place. This is an in-process
coordination change, not a new cross-process locking guarantee.

The updated release binary handled 32 actual checkout requests with concurrency
8 against the currently unavailable integration. All returned HTTP 502; balance
responses were unchanged, and an independent PostgreSQL read confirmed zero
orders. Invalid-token/viewer/currency requests retained HTTP 401/403/400 behavior.
Formatting and optimized compilation completed. These observations verify the
exercised rejection paths only. Concurrent successful upstream checkout,
configuration-write contention and any throughput improvement remain unmeasured;
no fixture outcome is used to claim those properties.
