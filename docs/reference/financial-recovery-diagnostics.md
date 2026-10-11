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
storage and worker updates, not a public diagnostic API, sustained recovery
capacity, customer-funded media or Supplier settlement.
