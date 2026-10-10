# Exact billing integer inputs

Administrative settled-funding, ledger reversal, balance-policy and warning-threshold
endpoints accept monetary nanounits and revision numbers as decimal strings.
Strings must contain only ASCII digits and fit a signed 64-bit integer. Leading
zeros remain accepted by the existing digit-only contract. Signs, whitespace,
decimal points and exponent notation are rejected before storage. Funding and
reversal amounts must additionally be positive; zero credit remains valid.

These endpoints share one parser. This closes the mismatch where Rust's general
integer parser accepted signed strings such as `+1` and `-0` even though the API
contract requires digit-only strings. Authorization still precedes parsing, and
existing account locks, liability rules and idempotency handling remain in storage.

## Current-input verification (2026-10-10)

The running release gateway received 36 actual authenticated HTTP requests covering
six invalid values (`+1`, `-0`, `1e9`, `1.0`, leading whitespace and signed-64-bit
overflow) across funding amount, reversal amount, approved credit, warning threshold
and both policy revision inputs. Every request returned 400 with the parser's
specific validation message. Independent SQL snapshots confirmed no change in
customer ledger-entry or balance-policy-history counts.

Funding probes also used an invalid currency, preventing unintended funding even
if input validation regressed; the observed parser messages distinguish rejection
from a later currency check. No successful payment was claimed, no payment receipt
was fabricated and no balance was credited. This evidence establishes the invalid
input boundary only, not successful funding, debit, reversal or reconciliation.
No fixture outcome is used as evidence.

## Text tariff and Supplier-offer rates

Customer tariff and Supplier-offer publication now share an exact rate parser:
nonempty ASCII decimal digits, from zero through 1000000000000000 nanounits per
million tokens. Signed forms such as `+1` and `-0` are rejected. Existing valid
rates, their unit and historical revisions are unchanged.

Actual requests on the preceding runtime showed signed forms reaching the
missing-record conflict for an unknown Supplier. On the rebuilt runtime, both
rate fields rejected signed, fractional, exponent, empty, whitespace-prefixed,
non-ASCII and out-of-range inputs with 400 before that lookup. Valid zero, one
and maximum rates still reached 409 for the deliberately unknown record.
Independent database reads found unchanged offer/tariff revision and customer
ledger counts. Release compilation and storage/gateway Clippy completed.

This verifies actual input rejection at the Supplier-offer endpoint. The shared
parser is also wired into customer tariff publication, but this run does not
establish successful publication, concurrent price editing or paid settlement.
