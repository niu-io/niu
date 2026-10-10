# Financial recovery coordination

Status: implemented with limited live coordination evidence, 2026-10-10.
[One real credit-backed customer backlog](financial-backlog-restart-live.md) now
has restart-recovery evidence, including two gateway contenders. A separate
112-request backlog exercised multiple batches and one isolated write fault.
A subsequent forced process exit verified restart at a nonempty cursor. Other
ledgers, loss during commit and broad capacity qualification remain incomplete.

The gateway runs customer reservation release, customer text-charge accrual,
Supplier text/media earnings and upstream cost settlement through one storage
scheduler. It reuses the same financial transaction helpers as foreground work.
Each ledger stage commits independently; an error in one stage does not prevent
trying the others. Payment reconciliation, video polling and non-financial
cleanup remain separate workers and are not covered by this scheduler's bound.

## Ownership and database work

Each stage waits at most 250 ms for a connection from the existing shared pool;
an acquisition timeout skips the stage without advancing its cursor. No second
pool is created, and the existing pool's connection limit still applies. A nonblocking
PostgreSQL transaction advisory lock, shared across all four financial stages,
permits only one stage owner per database. Losing contenders release their
connection immediately. Claim checks themselves briefly use a pool connection
in each contender; the bound is one connection performing claimed financial
work, not a claim that multiple processes never acquire connections concurrently.
Disconnect or transaction completion releases ownership automatically, without
a lease timeout that could permit overlapping owners.

The owner reads up to 100 eligible attempts in UUID order. Each attempt uses a
savepoint on that same connection, so an invalid record can roll back without
aborting other records in the batch. A 250 ms lock timeout bounds waits on
foreground locks; a 2 s statement timeout bounds individual database statements.
These limits do not establish a whole-batch latency guarantee.

The upstream-cost stage also releases held reservations when durable evidence
confirms nonexecution. [Actual OpenRouter authentication refusal](openrouter-auth-rejection-release.md)
verified customer and procurement release, including restart after both release
paths encountered injected database write errors. Unknown execution still holds
its liability; HTTP failures are not generically assumed to be free.

Migration 0218 stores a cursor for each stage. The cursor advances atomically
with successful batch work, including past rows that need a later retry. At the
end of the keyspace it resets, so earlier unresolved rows and newly eligible
attempts are revisited. Restart does not reset progress to the first UUID.
Existing explicit-cursor storage APIs share ownership and settlement logic but
retain caller-controlled traversal without changing the saved worker cursor.

Financial evidence and ledger rows are not rewritten by this migration.
A failed commit remains uncertain and is reconciled using existing idempotency;
no generation is resubmitted and elapsed time never makes an uncertain hold free.

## Current-input verification

The existing database was backed up privately before applying the additive
migration. After release compilation and restart, a second gateway was started
against the same database and encryption identity with a two-connection pool.
An independent PostgreSQL transaction acquired the scheduler's ownership lock.
Both gateway processes continued serving actual owner-funded Chat requests;
provider-reported usage matched independently read attempt records.

Across more than one five-second worker interval, all four saved progress
records remained unchanged while ownership was held. After its release, progress
updates resumed. No customer balance entry was added, and the original Supplier
credential revision and ciphertext digest were unchanged. Temporary access was
revoked, temporary mappings disabled and the second gateway stopped.

All-target Clippy, release compilation, formatting and public-tree boundary
checks completed. No fixture result supports this evidence. The live check had
no paid unsettled backlog: it does not verify competing settlement writes,
nonempty cursor recovery after process loss, poisoned-row progress, paid
idempotent debit/release, or throughput. Those require separate current-input
runs and independent financial artifact verification before qualification.

### Contended progress and safe diagnostics

An additional actual worker run held a row lock on the customer-charge progress
record. That stage's progress remained unchanged while the other three stages
committed progress; after releasing the lock, customer-charge recovery resumed.
The verifier did not insert or change financial evidence or ledger data.

The scheduler now reports each failed stage separately rather than discarding
all but the first storage error. Gateway warnings identify the stage and, for
per-attempt failures, their count. They never interpolate raw database errors,
SQL, credentials or financial amounts. After rebuilding and restarting, the same
lock check confirmed a runtime storage warning for `customer_charge`, with no
raw SQL or credential fields, while the other stages continued.

This verifies stage-level lock-timeout isolation and its diagnostic output.
It does not substitute for a malformed financial row, a paid backlog or restart
at a nonempty traversal cursor.

### Independence from content cleanup

A current-input lock check exposed a scheduling dependency: while the payload
cleanup DELETE waited for an independently held table lock, the financial
progress records stopped advancing because cleanup and settlement shared one
serial loop. The verifier observed the blocked backend in PostgreSQL before
measuring the six-second interval; it did not insert artificial ledger data.

The gateway now starts independent content-maintenance and financial tasks in
`background_recovery`. Both reuse the existing Store and pool, and both handles
are aborted at gateway shutdown. Financial ownership, per-stage transactions,
connection acquisition and cadence remain unchanged. No new pool is created.

After release compilation and restart, the same actual table lock kept payload
cleanup waiting while all four financial progress records advanced during the
six-second observation. The lock was then released. Clippy, formatting and
public-tree checks completed; no fixture outcome supports this observation.

This removes the serial scheduling dependency. It does not reserve connection
capacity: a one-connection pool or exhaustion by other work can still defer
financial recovery. Content expiry subsequently adopted
[separate ownership and SQL deadlines](content-retention-recovery.md). Interrupted
ingestion recovery, paid-backlog convergence and performance capacity remain
unqualified.

The later [nonempty customer-charge restart run](financial-backlog-restart-live.md) verified recovery of one actual upstream completion after both foreground accounting attempts failed. This extends the earlier empty-ledger coordination observations without qualifying broader backlog capacity.

## Small-pool recovery and bounded acquisition

A subsequent current-input run on 2026-10-10 exposed a remaining progress defect.
One real streaming completion had confirmed usage, no customer charge and one
held reservation after both foreground accounting connections were terminated
while blocked on the charge table. After releasing the table lock and restarting
with a one-connection pool, no customer debit appeared within 30 seconds.

Completing SQLx's asynchronous connection return between stages was insufficient
on its own: independently scheduled cleanup and financial workers could still
collide at every tick, with try-only acquisition repeatedly skipping financial
work. The shared background runner now uses a 250 ms pool-acquisition timeout,
then the existing nonblocking ownership claim and SQL deadlines. It commits each
domain separately and completes connection return, including pending rollback,
before its caller proceeds. A timed-out acquisition makes no cursor change.
There is no additional pool or connection allowance. Financial savepoints,
per-stage commits, durable traversal and safe diagnostics remain unchanged.

The rebuilt binary completed a fresh run with the same actual failure injection:

- The client received the requested nonce, complete SSE termination and usage of
  15 input and 7 output tokens. Before restart, independent database reads found
  one completed attempt, no customer charge and one held reservation.
- With the recovery pool restricted to one connection, the worker posted one
  debit of 8,766 USD nanounits, matching a separate integer calculation from the
  client's usage and internal customer rates, and released the reservation.
  Database observations during recovery stayed within that connection limit.
- All four stage progress records advanced. Charge reconciliation reported no
  missing, mismatched, duplicate or unexpected entries and no settled open hold.
  A further restart preserved one debit and one attempt.
- The separate actual-content retention run still removed an expired capture,
  preserved an unexpired response hash and both charges, skipped a locked expired
  row and removed it after unlock. The inspected-image expiry implementation now
  shares this runner, but populated inspected-image erasure was not exercised.
- After updating the development runtime, an independently held customer-progress
  row lock still allowed the other three stages to advance. Customer recovery
  resumed after release; its warning identified the stage without raw SQL or
  credentials. The verifier did not insert or rewrite ledger data for this check.

The paid run used an isolated native database, explicit internal credit and the
owner's personal upstream credential. No funding receipt or commercial Supplier
qualification was fabricated. Temporary access was revoked and isolated processes
stopped; the original encrypted identity was preserved. Formatting, all-target
storage Clippy, release compilation and public-boundary checks completed. Fixture
outcomes do not support these findings. This verifies one customer backlog under
the stated contention, not sustained saturation, production latency, other
nonempty ledgers or resolution of every GitHub Actions failure.
