# Supplier profile recording

## Current-input checkpoint — 2026-10-12

Supplier profile edits keep their existing platform authorization, input
validation and optional expected-revision contract. Name, description, website
and logo metadata are updated in the same transaction as the immutable
`supplier_profile_updated` audit record. An empty optional string clears its
field; omission or null preserves its existing value. Profile edits do not
publish an offer, qualify supply or change routes or prices.

The transaction now uses the shared bounded recording helper, also used by the
existing financial recording paths. Its private name reflects recording rather
than assuming every caller posts money. The helper sets a 250 ms individual lock
wait and a 2 second individual statement deadline in the transaction only. It
does not bound pool acquisition or the complete HTTP operation; domain locking,
validation and commit remain in each caller.

An isolated copy with actual model-request charges created a Supplier through the
normal administration API. An independent PostgreSQL session held its row lock.
Before the change, a valid profile edit stayed pending until release after 1.6
seconds. The changed implementation returned HTTP 503 in approximately 257 ms
while that lock remained held. Reading the profile and audit history confirmed
neither had changed. Retry after release recorded one profile revision and one
audit event; reuse of the old expected revision returned HTTP 409.

A temporary database trigger then delayed only the profile audit insert for three
seconds, after the profile update had executed. The statement deadline returned
HTTP 503 and rolled back the preceding profile mutation as well as its audit
record. Removing the delay and retrying the same expected revision succeeded.
Gateway restart preserved the final profile and continued rejecting the stale
original revision. The temporary fault was removed from the isolated database.

Independent reopening matched the saved HTTP profile response to the stored
metadata and final revision, checked exactly one audit event for each of the two
successful edits, and verified PostgreSQL lock/statement-timeout diagnostics.
Customer invoice and audit counts were unchanged. A subsequent actual personal
OpenRouter model request produced one exact customer charge and equal ledger
debit, with no active reservation or new funding receipt. No Supplier earning,
settlement, commercial agreement or qualification was fabricated. No fixture
outcome is evidence for this checkpoint.

This covers the observed row contention and audit-stage rollback/retry paths.
It does not qualify every concurrent administration race or uncertain commit
outcome, nor does it constitute frontend or commercial Supplier acceptance.

Clean committed `138b577` repeated both fault/recovery paths with independent
final-artifact and reopened-database checks; its held-lock response took about
256 ms. The native Gateway then refreshed to this binary after a fresh backup
restore and full-row comparison. Configuration, encrypted vendor identities and
durable business record counts stayed unchanged on schema 277. Readiness and
authenticated published-routing status were available after refresh.
