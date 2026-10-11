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
pending sweep over retained history, not a populated procurement recovery page,
Supplier earnings, more-than-100-row traversal or sustained capacity. No new
commercial qualification, upstream expense or customer charge is inferred.
