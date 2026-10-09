# Chat output bounds and customer reservations

Priced Chat requests validate `max_completion_tokens` or `max_tokens` against the
route's maximum output allowance. Both fields together are rejected. If neither
is supplied, validation inserts the route's maximum as `max_completion_tokens`.

Dispatch now passes that validated, forwarded output bound to the existing
reservation transaction. Previously Chat passed no request-specific bound, so the
transaction used the larger route default even when the client requested fewer
tokens. For example, a request capped at 8 output tokens on a route allowing 1,000
now reserves its output component for 8. The existing input reservation and tariff
remain unchanged. Actual provider usage still determines final settlement; a
reservation is not a customer charge.

Responses already passed its validated output bound and embeddings passed zero;
this correction aligns Chat's dispatch input with those existing paths.

## Verification boundary

Build and lint checks establish compilation only. Successful personal upstream
calls cannot establish paid reservation, cap admission, release or settlement.
Those financial behaviors still require a qualified paid current-input run with
independent ledger and reservation verification. This change does not implement
TPM. A TPM policy additionally needs explicit per-protocol input bounds, atomic
window reservations, actual usage reconciliation and unknown-usage handling.

On 2026-10-10, the rebuilt running gateway handled two actual personal Chat calls,
one using `max_tokens: 8` and one using `max_completion_tokens: 8`. Both returned
nonempty model responses within the requested completion-token limit. Independent
SQL confirmed two completed attempts and a completion-token total equal to the
returned usage. The temporary key was revoked. This verifies those personal
request paths only; it supplies no paid-reservation evidence and uses no fixture
outcome as a correctness signal.
