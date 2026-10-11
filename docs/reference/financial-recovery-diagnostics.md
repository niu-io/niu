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
