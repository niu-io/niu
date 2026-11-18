# Positive customer charge verification — 2026-11-18

Beads: `niu-nrcn.7`, `niu-nrcn.8`, `niu-i145`.
Hosted core: `3f949559156ff2499a900e6890b3e29ed6ed4dde`.
This record covers actual API operations and independently downloaded artifacts.
Fixture results are not evidence.

## Isolated setup and bounded invocation

A new organization and workspace used a temporary key restricted to the existing
DeepSeek route. Initial discovery inherited the platform's zero customer rates.
Publishing a workspace tariff while platform default selection applied returned
409. An explicit null compatibility enrollment was then published only for this
isolated workspace; global prices and other customer configurations were unchanged.
The effective customer tariff independently read back as 1,000,000 input and
2,000,000 output nanounits per million tokens, with a 10,000-nanounit minimum,
zero request fee and flat token categories.

The initial 10,000-nanounit noncash grant and matching key limit were insufficient
for admission. HTTP 402 left no attempt, charge or reservation. Current public
catalog data gives this route a 1,000,000-token context; the deployed admission
code reserves the configured input bound and requested output bound. With the
96-token output limit, the applicable reservation is 1,000,192 nanounits.
A second explicit noncash grant added the difference, and the key cap was set
to that exact total. These grants are administrative noncash credit, not merchant
receipts, cash settlement or revenue.

The next submission returned 503 `service_not_ready`, again with no attempt or
held reservation. The fresh isolated workspace lacked its platform procurement
budget. After explicitly configuring that budget at zero for the existing
route with configured zero internal procurement rates, one new bounded request succeeded. Neither denied
request was blindly retried; authoritative inventory was read before recovery.

## Independent conservation and output

The actual completion returned exactly `BILLING_CONFIGURED_20261118`, with
44 input and 38 output tokens. Rounded token pricing is 120 nanounits, so the
10,000-nanounit minimum applies. Independent administrative request inventory
contained exactly one completed attempt charged 10,000 nanounits in USD.

Balance entries were +10,000 and +990,192 noncash adjustments and one −10,000
charge. Their sum and the independently returned available balance were both
990,192. Reserved balance was zero and the reservation list was empty. The key's
committed amount was 10,000 and remaining amount was 990,192. This establishes
positive-charge conservation for the explicit compatibility tariff, not the
separate platform-default pricing path or real payment settlement.

## Customer boundaries and actual export

An ordinary organization owner read its billing projection, balance, transactions,
requests and generation evidence. Those inspected projections contained none of
the enumerated procurement-rate, upstream-expense, margin or credential fields.
Requests to procurement administration, commercial position, platform financial
summary and platform pricing returned HTTP 403.

A real customer request CSV contained exactly one row. Its 44 input tokens,
38 output tokens, USD currency and 10,000-nanounit customer charge matched the
independent request record. The downloaded file was 644 bytes, SHA-256
`6b6df36e87fce7396962aa4eb20ff917ad86ed80345e6c7f14249c712d4043cd`.
Its columns described customer charges and request outcomes, without procurement
or margin columns. This is scoped projection/export evidence, not exhaustive
security or UI acceptance.

Two earlier read-only probes used viewers for organization-wide finances and
received 404; source authorization correctly requires an organization owner or
administrator. A query with an unsupported `limit`, and platform-financial reads
missing required currency, were invalid verification inputs. They are excluded
from product-defect conclusions. All temporary actors and the inference key were
revoked and independently returned 401. Audit history and the expected remaining
noncash balance are retained in the isolated scope; no merchant funds moved. This run does not establish an upstream Provider invoice or expense.

## Corrected default-enrollment contract

The fresh workspace's actual enrollment read returned version zero, platform
pricing, a non-null platform price identity and its effective tariff. The old
handler description incorrectly promised workspace pricing and a null identity.
After explicit null enrollment, independent readback returned version one,
workspace pricing and null price/effective-price fields, while model discovery
returned the configured compatibility tariff.

The handler description and all generated API references now distinguish automatic
platform inheritance from explicit-null compatibility behavior. Runtime selection
is unchanged. API generation and consistency checks completed. Remaining billing
acceptance includes platform-default positive charges, rendered customer journeys,
Credits-mode behavior and real merchant settlement under its separate authority.

## Current 0.3.1 candidate follow-up

On core `18178194c24f1ea932165ee53a72cdc45f49207d`, hosted composition
`a9880be3ddb19024ec26cbba0b71e25b63900d64`, a new current-input request used
the same isolated compatibility tariff. Read-only inspection of all three
published platform text prices found zero rates and fixed charges. No global
price was changed; positive platform-default pricing remains a separate gap.

The isolated starting balance was 998,192 nanounits. An explicit 2,000-nanounit
noncash grant funded the exact 1,000,192-nanounit admission bound, and a fresh
model-restricted key had that exact spending cap. One actual request returned
`BILLING_031_CURRENT_20261118`, 45 input tokens and 35 output tokens, with stop
finish reason. Independent key-filtered inventory contained exactly one completed
request. The calculated token amount was 115 nanounits, so the configured
10,000-nanounit minimum applied. The final balance was 990,192, reservations
were empty, and the independent ledger sum equaled the balance.

A fresh ordinary organization owner then read current billing, balance,
transactions and requests. Procurement, commercial position, platform financial
summary and platform-pricing reads each returned 403. The current customer CSV
contained three actual historical/current requests, including this new request.
Independent parsing compared the complete multiset of input/output token counts,
customer currencies and customer charges with the independently read request
inventory, and found an exact match. The CSV was 1,163 bytes, SHA-256
`69f21245cf60665be6fbf3844ef8a6d6ad5fd8097bb7f5177a7c7b8e519692ce`.
Inspected customer projections and export fields did not contain the enumerated
procurement-expense, margin or credential fields. Both temporary credentials were
revoked and direct reuse returned 401.

This verifies a fresh positive compatibility charge and customer export on the
current candidate. Noncash test credit is not merchant settlement or revenue.
It does not close platform-default positive pricing, rendered billing/Credits
journeys, real merchant payment, or the full BILLING-03 case. Fixture outcomes
were not used.
