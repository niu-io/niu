# Exact metered cost calculation

Niu-owned calculation foundation for explicit media billing units. It is separate
from the unmodified, selectively imported floating-point text cost engine.

`seedance_estimate` calculates rational video-token estimates from output and
reference-video duration, output dimensions and frame rate. An estimate is never
reported usage. `Usage::Unresolved` cannot become a zero charge. Meter names are
explicit: seconds and video tokens cannot be silently interchanged.

`select_tariff` matches model/version, channel, resolution and reference-video
presence exactly at a half-open effective interval. Missing and overlapping
matches fail. Each tariff specifies its revision, currency, decimal precision,
quantity denominator, minimum quantity and rounding. `calculate` uses checked
integer arithmetic and rounds only the final currency amount. The minimum is a
quantity floor; adapters must specify zero when reported usage already accounts
for a minimum. A zero rate is explicit configuration, not an unknown fallback.

Amounts use the declared smallest accounting unit. For example, precision six
means one million amount units per currency unit. No currency conversion occurs.
Retain the complete pinned tariff and usage with a calculation receipt to
reproduce historical amounts; editing the active tariff must not reprice history.

`pin_pricing` owns a copy of the selected tariff and discounts. Rules have explicit
dimension, offer and customer eligibility, half-open effective periods, unique
revisions and priorities. Higher priority wins: an exclusive top rule applies
alone; otherwise eligible multiplicative rules stack, ignoring lower exclusive
rules. Tied eligible priorities fail, including ties on ignored rules. Discounts
are rational remaining-price fractions between zero and one and are applied
before final currency rounding. No percentage is a product constant. Configuration
is bounded to 64 rules per calculation. Receipts identify applied revisions;
snapshots expose the complete selected rules for durable historical reproduction.
`encode`/`decode` provide a bounded version-one persistence document. Rational
numerators and denominators use canonical decimal strings, preserving quantities
beyond 64-bit JSON numbers. Decoding revalidates the cards/rules and recomputes the
multiplier. Unknown fields, unsupported versions and noncanonical quantities fail.
The document is internal pricing evidence, not a customer request response.

This crate does not qualify a Provider, select commercial offers,
persist snapshots, reserve funds, submit jobs or settle a ledger. Customer and
Supplier cards must remain separately authorized at those integration boundaries.
The gateway does not yet use this calculator for video jobs. Media API, durable
reconciliation, rate/discount storage and live qualification remain required.

Run `cargo test -p niu-metered-cost` for exact quantities, reference duration,
reported versus estimated usage, units, minimums, rounding, interval/dimension
selection, discount eligibility/priority/stacking, historical reproduction and
overflow checks.
