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
