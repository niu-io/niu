# Durable financial recovery diagnostics

Migration 269 adds nullable last-step time, candidate count and per-attempt failure
count to each financial recovery stage. Existing creation/update timestamps are
not interpreted as evidence that a worker ran. All three new fields remain null
until a durable worker step commits after the migration.

The worker writes diagnostics in the same transaction as its cursor. A candidate
can be ineligible for settlement; zero failures does not mean all liabilities are
settled. Counts describe the last committed page, not totals, backlog size or
recovery throughput. A rolled-back transaction leaves the previous diagnostics
unchanged. Explicit-cursor library calls do not update durable worker diagnostics.
Storage failures still use the existing safe worker error reporting.

## Current-input verification — 2026-10-11

An isolated copy of 101 actual committed, uncertain HTTP admissions ran the current
native worker. Before worker execution, applying the migration in a rolled-back
inspection transaction showed six null diagnostic records. Actual worker commits
then recorded 100 and 1 candidates for customer charge, balance release and upstream
cost traversal. All six stages recorded committed steps. Independent reopening
verified retained unknown liabilities, exact procurement reservations, empty
financial ledgers and recorded page diagnostics after restart.

A separate fresh request received an actual OpenRouter authentication rejection.
A temporary database fault blocked release of its customer reservation. With the
fault retained across restart, the worker committed one candidate and one failure.
After fault removal, recovery released the hold and subsequent progress recorded
zero failures. Independent reopening verified the retained failure snapshot, actual
401/nonexecution record, exact release timestamp, revoked key, unchanged ledger
and absence of a charge for the rejected request.

Both runs used isolated databases and a binary containing shared working-tree
changes; hashes and raw evidence remain private. Compilation and formatting were
checked separately. No fixture outcome is acceptance evidence. The original
development database was not migrated. These checks qualify durable diagnostic
storage and worker updates, not sustained recovery capacity, customer-funded media
or Supplier settlement.

## Platform API and JavaScript SDK

`GET /admin/v1/platform/financial-recovery` returns `observed_at` and `data`, an
alphabetically ordered array of the six stages. Each row contains `stage`,
`last_step_at`, `last_candidate_count`, `last_failure_count` and `has_cursor`.
The three last-step fields are nullable as described above. A single database
statement supplies the projection. No attempt identifier or monetary value is
included. The JavaScript admin SDK exposes `getFinancialRecoveryDiagnostics()`.

Actual HTTP calls against the migrated isolated database returned six rows for
platform administration, 401 for invalid authentication and 403 for a scoped
workspace viewer. The built SDK retrieved the same six-stage contract through
HTTP. Restart and independent database reopening retained the 101 unknown
liabilities and unchanged ledgers. The response and SDK artifacts were saved
privately; these calls do not qualify all other principal types or storage-outage
responses. Generated OpenAPI and documentation expose the operation and its
nullable fields; the SDK typecheck and docs build completed separately.

## Never-run versus empty committed work

A fresh PostgreSQL database was migrated by the native Gateway while a separate
connection held the real financial-recovery advisory claim. Actual HTTP reads
returned six stages with null last-step fields, including after Gateway restart.
Releasing the claim allowed the worker to commit six empty pages: timestamps then
became non-null and candidate/failure counts became zero. A further restart kept
this distinction. Independent database reopening verified migration 269, six
committed empty stages, and no attempts, customer charges, balance entries,
procurement cost entries or funding receipts. Saved HTTP artifacts independently
preserve the before/after response shapes. This establishes response semantics for
an unexecuted worker, not an outage detector or a populated settlement result.

## Failure response verification

A new actual OpenRouter authentication rejection with a database release fault
produced an HTTP diagnostic row with one candidate and one failure. Temporarily
renaming the diagnostic table in the isolated database made authenticated reads
return 503 without SQL, table names or database messages. Invalid authentication
still returned 401 during this storage fault. Restoring the table restored HTTP
200. Removing the separate release fault allowed the retained reservation to be
released. Independent reopening verified the recorded failure, exact release,
revoked key and unchanged customer ledger. This is a targeted missing-relation
failure check, not a qualification of every database outage mode.

## Rendered documentation check

The served operation page was inspected in the browser at 1440px and 390px widths.
The endpoint, privilege boundary and last-page semantics rendered without document
horizontal overflow. Its downloadable OpenAPI JSON returned HTTP 200 and included
`getFinancialRecoveryDiagnostics`. This verifies local generated documentation;
it is not a hosted deployment claim.

## Bounded diagnostic read — 2026-10-12

Implementation `e4f00fa` reuses the bounded read-only financial snapshot
initializer for the platform diagnostic query. Its existing projection,
authorization and response shape are unchanged. The transaction-local lock wait
is 250 ms and the statement limit is two seconds. Pool admission and caller
authorization are separate; this is not a whole-HTTP deadline.

An actual native run copied stopped history containing a genuine upstream
completion and exact customer debit. With the progress table locked, the preceding
immutable binary's HTTP read remained pending after 1.6 seconds. The updated
immutable binary returned 503 after approximately 258 ms while the lock remained
held. An unrelated balance read returned 200 during contention. After release
and restart, the diagnostic read returned all six safe stage projections.
Independent reopening checked the error body, restored field sets and server
lock-timeout record against the original native response, invoice, exact debit
and unchanged account fingerprint. No inference, funding, payment or financial
mutation was introduced. No fixture outcome is evidence.

A fresh native backup was restored and fingerprint-checked before updating the
existing installation. Exact binary digests were checked; original configuration,
encrypted identity and durable counts remained unchanged. Readiness and persisted
routing agreement were confirmed on schema 278. These observations do not
establish backlog settlement, zero recoverable debt or complete release readiness.
