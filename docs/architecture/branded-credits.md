# Branded consumption units

This design specifies the implementation contract for [issue #110](https://github.com/niu-io/niu/issues/110),
tracked in Bead `niu-2xp.3`. It is not evidence that the feature is implemented
or release-ready. Execution state belongs in Beads; actual acceptance evidence
belongs in the dated release verification record.

## Installation mode and compatibility

Real-currency billing remains the default. Branded Credits is an explicit,
installation-wide customer billing mode, independent of Provider procurement
and settlement. An administrator publishes a versioned unit definition and
conversion rule before enabling it. Workspaces cannot choose competing units.

The unit definition contains a customer-visible name, display precision from
zero through nine decimal places, and a stable unit identity. Quantities use
integer atoms, with one unit equal to 1,000,000,000 atoms. JSON quantities and
conversion integers are decimal strings, avoiding JavaScript integer loss.
Changing a display name or precision creates a new definition revision; stored
transactions retain their original definition. A positive value smaller than
the display quantum must never appear as zero: show a less-than indication and
make the exact quantity available in transaction details and exports.

Enabling or disabling the mode requires an explicit preview and revision-checked
publication. Outstanding balances, debt, credit facilities, pending checkouts,
reservations, unsettled requests and unapplied adjustments prevent a mode switch.
The response identifies each incompatible category and the affected customer
account without exposing procurement data. An empty account is not an obstacle;
historical transactions remain readable in their original unit. Existing monetary
prices, budgets and API contracts are never silently reinterpreted as Credits.
Credits prices and budgets must be explicitly published before affected requests
can be admitted. Existing clients that cannot distinguish billing units receive
an explicit unsupported-unit error on billing operations, not a fake ISO currency.

Once Credits is active, publishing another purchase conversion does not require
draining balances. Existing purchase lots, open checkouts, admitted requests and
historical statements retain their pinned rules. Changing purchase conversion
does not silently change consumption tariffs. These are separate publications.

## Exact conversion and pricing

A purchase rule identifies its real payment currency and a positive, reduced
rational number `numerator / denominator` of Credits per currency unit. Both
parts are bounded positive integers. There is no implicit foreign exchange.
For a payment expressed in currency nanounits, the issued quantity is:

```
credit_atoms = payment_nanos * numerator / denominator
```

Checkout accepts only amounts that are representable both by the payment
processor's currency precision and as an integral number of credit atoms. It
rejects an inexact conversion instead of silently rounding purchased value.
Checked wide-integer arithmetic precedes conversion to stored quantities.
The saved checkout records the real amount, currency, exact received quantity,
unit-definition revision and purchase-rule revision. All are disclosed before
redirecting to payment. Callbacks use this saved quotation, including when a new
rule has since been published. Failed, expired or unverified payments issue no
units. A repeated verified callback issues exactly one lot for its original order.

Consumption tariffs are explicitly denominated in Credits. Text rates retain
their existing per-million-token categories, cache categories and context tiers;
media rates retain their explicit quantity dimensions. Price publication may
offer a conversion preview from an existing customer monetary tariff, but must
show and save the resulting integer atom rates before confirmation. Round each
converted rate upward once at publication if necessary; never substitute an
upstream purchase price. Dispatch pins the published unit tariff. Settlement
sums the applicable exact rate products and rounds upward once at the existing
quantity denominator. The displayed tariff and charged tariff are the same
revision. Explicit zero prices remain valid; absent prices remain unavailable.

Customer spending limits, reservation bounds and budget consumption use the
same atom unit as the selected tariff. They do not compare Credits to monetary
nanounits. Credits admission never falls through to a monetary balance. This
mode initially requires prepaid capacity; an existing monetary credit line
cannot become a branded-unit lending facility through a mode switch.

## Lots, provenance and reservation

Credits have their own append-only issuance, reservation, consumption,
restoration, expiry and reversal records. They do not overwrite
`customer_balance_entries.amount_nanos` or use a made-up currency code in the
monetary ledger. Each issuance lot pins its unit definition and provenance:

| Provenance | Issuance evidence | Monetary backing | Expiry |
| --- | --- | --- | --- |
| Purchased | Independently verified payment receipt and saved checkout | Original real payment amount and currency | None |
| Promotional | Authorized grant with reason and idempotency key | None | Optional explicit future deadline |
| Simulated | Verified test-payment evidence or explicit test grant | No verified cash | Optional explicit future deadline |

Configuration changes cannot promote simulated issuance into purchased cash.
Promotional and simulated grants never create Provider earnings or money receipts.
Consumption order is promotional lots by earliest expiry, then non-expiring
promotional lots, then simulated lots by expiry and issuance, then purchased lots
by issuance. Stable internal tie-breakers make allocation deterministic. The
customer sees this order and provenance totals before funding and in balance
details. A request may consume multiple lots; its record preserves every source.

Admission locks the account and reserves exact available lot ranges for the
upper bound. It must not reserve a lot already expired at admission. A reservation
made before expiry remains usable only by its pinned request; it does not renew
the lot or make expired remainder available to other requests. Unused expired
capacity becomes expired when the reservation is released. Unknown upstream
outcomes retain their reservation until evidence resolves them. Settlement and
release are atomic and idempotent for text and media requests, including explicit
zero charges. Concurrent requests cannot allocate the same range.

## Monetary backing and reversals

Different purchase rules can coexist in the same Credits balance. For example,
100 Credits purchased for one dollar and 200 Credits purchased for one dollar
remain distinct backing lots even though their consumption unit is identical.
Neither changing the purchase rule nor spending those lots revalues old purchases.
The Credits quantity is not a claim that all remaining units have today's cash
exchange value.

Purchased lots preserve integer backing without accumulating per-charge rounding
errors. A lot with `U` atoms and `M` monetary nanounits represents atom positions
`[0, U)`. An allocation of a half-open range `[a, b)` carries:

```
backing_nanos = floor(M * b / U) - floor(M * a / U)
```

Store ranges, never individual atoms. Disjoint allocations partition the original
lot and their backing sums exactly to `M`. Restoring a charge restores its original
ranges and backing, not ranges valued using the current conversion. A partial
refund splits original allocation ranges; repeated partial refunds cannot exceed
the original consumption. This permits exact reconciliation even after other
requests have consumed later portions of the same lot.

A consumption refund restores the original provenance and expiry. Restored
promotional units past their original deadline remain expired; refunding a grant
cannot turn it into cash or extend its life. A purchase reversal removes only
unconsumed, unreserved ranges belonging to the original purchase. Its real refund
amount must be representable at the payment processor's precision; the preview
shows any residual units and monetary backing instead of discarding them.
Already consumed purchases require an explicit linked consumption correction
before those ranges become reversible. Recording a reversal is distinct from
executing or verifying an external cash refund.

Customer Credits charges and monetary backing release are separate facts.
Financial reporting uses the actual purchased backing allocations, separates
promotional and simulated consumption, and preserves unknown legacy coverage.
It must not also count a reference monetary price as revenue or create a duplicate
legacy balance debit. Procurement costs, Provider earnings and settlements remain
in their original currencies and authorization scopes. No purchase cost, margin,
procurement budget or Provider settlement rate enters customer responses.

## Transaction boundaries and public surfaces

Platform configuration publications use `GET /api/v1/platform/units`,
`POST /api/v1/platform/units/definitions` and
`POST /api/v1/platform/units/rules`. The administration SDK exposes
`getCustomerUnitConfiguration`, `publishCustomerUnitDefinition` and
`publishCustomerUnitPurchaseRule`. All three require platform administration.
Configuration publication does not itself enable Credits billing. Reads return
the latest definition and the latest rule per currency for that definition;
publishing a new definition leaves its rule list empty until explicit publication.
Historical definitions and rules remain immutable. Revisions and ratio components
are canonical integer strings, and purchase ratios are reduced before persistence.
Idempotency compares semantic input, so equivalent reduced ratios are equivalent
inputs. A repeated successful write returns its original revision even after
newer publications.

The platform can prepare a persisted purchase preview with
`POST /api/v1/organizations/{organization}/billing/quotes` and retrieve it at
`GET /api/v1/organizations/{organization}/billing/quotes/{quote}`. The SDK exposes
`prepareCustomerUnitQuote` and `getCustomerUnitQuote`. New previews require the
current purchase rule for its currency and the latest unit definition. They pin
the exact payment amount and resulting atom quantity for fifteen minutes.
Replaying an existing intent returns its original record, including the original
expiry, rather than selecting a newer rule or renewing the deadline. Preparation
does not create a payment order or issue capacity. The checkout binder must
separately enforce mode, owner, currency, amount, processor precision, expiry
and single use before accepting that quote. Until the customer checkout workflow
is connected, these preview operations require platform administration.

Checkout accepts an optional `quote_id` in its existing intent contract. New
currency-mode orders reject a quote; new Credits-mode orders require one. The
quote is bound in the order-creation transaction before a provider request or
local checkout link is saved. The binder checks company, exact payment amount,
currency, original expiry and single use. Replaying a saved order requires the
same quote and preserves the original result even after purchase-rule changes.
Paid and closed order state remains shared across both funding modes.

Verified Credits payments create an immutable purchase lot and a separate
`customer_unit_funding_receipts` record. `customer_payment_references` enforces
one funding target per channel and payment reference across monetary and Credits
receipts. Existing monetary receipt triggers continue to operate only on monetary
wallet funding. A Credits settlement references its lot instead of a monetary
balance entry. The lot and receipt must match the saved quote, provider payment
identity and immutable simulated-payment provenance. The monetary receipt,
quoted quantity and unit definition remain available in order history.

Purchase-rule publication, mode publication, checkout creation and request
admission serialize on the installation billing revision. Lot operations also
serialize on the customer account, in a documented consistent lock order.
Idempotency compares the original semantic input, including unit and rule
revisions; reuse with different input conflicts. Uncertain client responses
require authoritative rereads, not generation of another idempotency key.

The customer unit must be explicit in catalog prices, Chat, Generations, API-key
limits, workspace budgets, funding, usage, invoices or consumption statements,
downloaded exports and applicable SDK/API responses. Monetary payment receipts
continue to show the real currency alongside the Credits issued. Historical
pages may contain both billing modes and must group by unit and revision rather
than summing incompatible values. Public API schemas use a discriminated unit
contract and exact string quantities; existing monetary fields retain their
documented monetary meaning. Platform accounting includes provenance and backing
reconciliation without exposing these administrative details in customer flows.

## Required independent acceptance evidence

Use the running application with current inputs, real database transactions and
the authorized mock payment gateway. Independently inspect saved quotes, signed
payment evidence, unit lots, reserved ranges, allocations and final customer and
financial artifacts. Fixture outcomes are not evidence.

Acceptance must cover exact and rejected inexact conversion; two coexisting
purchase rules; checkout started before a rule change; failed, repeated and
concurrent notifications; explicit zero and nonzero text and media charges;
multi-lot consumption; promotional expiry during an active reservation; concurrent
admission; interruption and restart recovery; full and partial charge refunds;
purchase reversals and processor precision; original-rule history and exports;
customer and administrator authorization; and blocked incompatible mode changes.
Rendered acceptance includes checkout disclosure, exact small quantities,
provenance, pricing, budgets, usage and history in both supported languages at
desktop, intermediate and narrow widths. These requirements remain part of the
release gate until their actual results have been recorded.
