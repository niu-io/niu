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

## Priced Chat input-size guard

Priced Chat now rejects a serialized `messages` array whose UTF-8 byte length
exceeds the route's `max_input_tokens` value, matching the existing byte-based
admission approach used by priced Responses and embeddings. Chat serialization
includes role labels, JSON framing and escaping as well as text content. A small
configured limit can therefore reject even a short message. This check runs after
supported-message validation and before attempt preparation or dispatch.

The legacy configuration field remains named `max_input_tokens`; this input-size
guard is not an exact provider tokenizer. It does not establish a universal bound
on hidden prompt framing or provider-reported usage. Reported overruns must still
be recorded and settled. The separate [token budget](api-key-token-rate-limits.md)
uses an explicit estimate, not an exact tokenizer. Compilation and linting
have been checked; actual paid-path acceptance/rejection and financial effects of
this new guard remain unverified. Personal routes do not enter this priced guard.
