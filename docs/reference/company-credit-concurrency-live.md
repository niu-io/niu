# Company credit across workspaces: current-input concurrency

Date: 2026-10-10. Includes migration 0220.

## Incomplete lock fix discovered by real traffic

The earlier [shared-key run](key-spending-multi-instance-live.md) corrected the
application's balance-reservation lock. A subsequent real run across two
workspaces and independent keys still returned one completed request and three
storage HTTP 503 responses. PostgreSQL recorded deadlocks between the account
reservation query and the reservation insert. The latter invoked database
triggers that still requested `FOR UPDATE` on the same account.

Changing only the application query was insufficient: a later trigger could
upgrade the lock and recreate the cycle. Migration 0220 replaces the current
definitions of five account guards, using `FOR NO KEY UPDATE` consistently:

- Workspace-limit revision/cap protection and reservation enforcement.
- Key-limit revision/cap protection and reservation enforcement.
- Media debit capacity enforcement.

Their financial predicates, revision rules and error behavior are unchanged.
These guards do not modify account key columns. Reservation and policy decisions
remain serialized while foreign-key pins remain compatible. Previous migrations
and historical financial records are not rewritten.

## Verification setup

A separate native PostgreSQL database and two local gateway processes used real
personal self-funded OpenRouter inference. Management APIs created two workspaces,
independent API keys, explicit internal tariffs and a shared company credit limit
of 284,445 USD nanounits, enough for one maximum reservation. No per-key spending
limits were configured in this run. No external funding or commercial Supplier
qualification was asserted.

An initial contention gate showed that cold price publication can first serialize
requests on workspace configuration locks. The completed run therefore warmed
each instance/workspace's price publication using zero-credit requests, all
rejected before creating attempts. It then restored the explicit company credit
and used a temporary account row lock as a synchronization gate.

All four actual admissions were independently observed waiting on the account
lock before it was released. Thus the successful result below does not depend
on requests accidentally arriving one at a time.

## Observed results

- One strict-schema request completed with 46 reported input and 10 output tokens.
  Three returned HTTP 402 with `budget_exceeded`; none returned storage 503.
- An independent integer calculation matched the single customer debit of
  **15,556 nanounits**. Only one attempt and charge existed, and no open balance
  reservation remained. No deadlock diagnostic appeared in the PostgreSQL log.
- Company balance and available capacity reflected that debit. The winning
  workspace's billing view contained the charge; the other workspace's balance
  summary was empty. Charge reconciliation reported no discrepancy.
- Further requests could not reserve another maximum amount. After both gateway
  processes stopped and one restarted, the same shared company limit still
  rejected them without creating another attempt.
- The earlier two-gateway single-key cap scenario was rerun with migration 0220:
  one completion, three key-cap denials, exact debit, released holds and preserved
  post-restart enforcement were observed again.
- Temporary keys were revoked, mappings and Suppliers disabled, and isolated
  servers stopped. The existing development database was backed up privately,
  upgraded through 220 and reached readiness. Independent catalog reads confirmed
  all five installed guards use the intended lock mode.

Compilation, static checks and public-boundary review completed. Fixture outcomes
were not used for diagnosis or verification. Media debit contention, concurrent
policy edits, large backlogs and sustained performance remain unqualified. This
checkpoint does not identify every GitHub Actions failure or establish full
release readiness.

## Workspace caps preserve another workspace's access

A separate current-input run on the backend at `5a2449d` exercised a workspace
limit while the company still had available credit. Its isolated native database
used an explicitly configured credit limit of 1,000,000,000 USD nanounits and
internal verification tariffs. Actual personal OpenRouter calls supplied the
output and usage; no funding receipt or commercial qualification was created.

The first workspace completed a strict-schema request with a fresh marker and
48 input / 11 output tokens. Its independently calculated charge and debit were
16,791 nanounits. The management API then set its workspace limit to exactly that
consumed amount. A subsequent inference request returned HTTP 402 with
`workspace_spending_limit_exceeded`, without creating another attempt.

A second workspace, with its own key and the same company account, completed a
buffered request and, after a gateway restart, a streamed request. Their charges
were respectively 16,791 and 8,889 nanounits, calculated independently from the
returned usage. The first workspace still returned the same limit error after
restart. The final database and management API reads established:

- Exactly three attempts, with matching customer charges, debits and configured
  procurement arithmetic for each actual completion.
- Workspace commitments and billing totals of 16,791 and 25,680 nanounits;
  only the first workspace had a configured workspace limit.
- Company balance of -42,471 nanounits, no outstanding reservation, and available
  capacity of 999,957,529 nanounits. Charge reconciliation had no discrepancies.
- No funding receipts; the original saved credential revision and ciphertext
  digest were unchanged. Temporary keys and routing were disabled and the
  isolated processes stopped.

This verifies sequential workspace-cap isolation and restart persistence for
these actual text requests. Concurrent cap edits, media admission and frontend
behavior are outside this run. Fixture outcomes were not used as evidence.
