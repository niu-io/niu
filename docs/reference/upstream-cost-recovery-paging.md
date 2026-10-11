# Upstream cost recovery candidate paging

Upstream cost recovery now traverses at most 100 held procurement reservations
before checking execution and usage. It uses the pending-reservation partial
index introduced in migration 265. Settled and released reservations are excluded
from the candidate page. Unknown or in-flight attempts advance traversal without
being treated as eligible settlement or release work.

Eligibility is unchanged: a confirmed non-executed attempt can release its
reservation; a confirmed completed attempt with provider-reported usage can enter
the existing cost settlement function. That function remains responsible for
validating the actual accounting inputs.

All six financial recovery stages now return the same four fields: attempt,
organization, workspace and eligibility. The worker no longer adapts an exceptional
three-column query. Cursor advancement, per-row savepoints, ownership and
connection handling are shared; this does not make their business acceptance
evidence interchangeable.

## Current-input verification — 2026-10-11

An isolated copy of retained actual development history contained settled
procurement reservations and no held procurement candidates. Both old and new
queries returned no work. The rebuilt native worker advanced its durable stage
timestamp, and restart preserved exact reservation, attempt and customer ledger
records. An independent process reopened the stopped database and checked those
records, the query hash, saved plans, worker progress and valid partial index.

The binary included shared working-tree changes. Format, compilation and Clippy
completed separately; fixture outcomes are not evidence. This verifies the empty
pending sweep over retained history. The nonempty release case below adds a
separate boundary; Supplier earnings, more-than-100-row traversal and sustained
capacity remain unverified. No new commercial qualification, upstream expense or
customer charge is inferred.

## Independent release failures with actual upstream rejection

A new request under explicit internal verification rates received an actual
OpenRouter 401 and the supported text nonexecution classification. A temporary
trigger blocked procurement reservation release. The customer reservation still
released, while the procurement reservation remained held across Gateway restart.
After revoking the key and removing the fault, the paged worker released that
reservation and reduced reserved procurement budget by its exact original amount.
Another restart preserved the released state and unchanged customer ledger.

Independent database reopening checked the actual 401 record, nonexecution,
reservation amount/state, exact budget decrement, released customer reservation,
revoked key, single attempt and removed trigger. No customer charge was created.
A reciprocal actual-request run blocked customer release and confirmed procurement
release still completed while the customer hold remained; removing that fault
then allowed customer recovery without a ledger debit.

These isolated runs establish independent recovery for this explicit authentication
rejection policy. They do not generalize nonexecution to arbitrary errors or
qualify positive upstream cost settlement and commercial Supplier earnings.
