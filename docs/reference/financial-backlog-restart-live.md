# Current-input customer charge recovery across restart

Date: 2026-10-10. Backend revision: `b1223c0`.

This extends the [internal credit workflow](internal-credit-workflow-live.md)
with a real nonempty customer-charge backlog. The run used a separate native
PostgreSQL cluster, normal management APIs, bounded administrator credit and one
personal self-funded OpenRouter call. No completion, usage, charge or funding
receipt was inserted as fixture data. The existing development database
and original encrypted credential identity were preserved.

## Fault and observed state

The verifier held a transaction-level `SHARE` table lock on `customer_charges` in
the isolated database. This permits reads but prevents the customer charge
insert. A real streamed GPT-4.1-mini request reached confirmed completion and
blocked on that insert, as independently observed in `pg_stat_activity`.

Terminating the first blocked database session was insufficient to end completion
processing: the gateway retried the record individually. The completed run
terminated both blocked accounting sessions while retaining the table lock.
Private runtime logs independently contained both batch-failure and individual
fallback-failure diagnostics. Neither interruption changed the upstream result.

The client received HTTP 200, complete streamed output, `[DONE]` and reported usage
of 15 input and 6 output tokens, without a client transport error. Before stopping
the gateway, independent reads showed:

| Persisted artifact | Count |
| --- | ---: |
| Confirmed completed attempt | 1 |
| Customer charge | 0 |
| Open customer balance reservation | 1 |

This demonstrates a delivered result with pending financial work, not free usage
or permission to discard the reservation.

## Recovery and independent checks

The first gateway was stopped while the lock still prevented accrual. The
verifier then released its lock and restarted the gateway against the same
database. The financial worker created one customer charge and one matching
negative balance entry and released the held reservation.

Using the configured internal customer rates and the usage delivered to the
client, a separate integer calculation produced **7,778 USD nanounits**. That
amount matched both persisted financial records. The reconciliation API reported
no missing, mismatched, unexpected or duplicate charge sources, and no settled
open reservation.

A second restart preserved one original debit and one attempt. No additional
durable execution was observed. Financial recovery uses database-only helpers;
the run did not separately capture outbound network traffic to prove egress
absence. The temporary key was revoked and the isolated mapping and Supplier
disabled. Both isolated servers were stopped.

## Limits

This verifies one real credit-backed text charge recovering after accounting
connection termination and process restart. It does not qualify a lost commit
acknowledgement, recovery of media or Supplier earnings, competing gateways over
nonempty work, cursor traversal beyond a batch, poisoned records, merchant
funding or sustained throughput. The lock and terminated sessions were explicit
fault injection into the isolated database, not simulated upstream responses.
No fixture outcome supports this checkpoint.

## Two gateways recovering one real backlog

A further current-input run on 2026-10-10 used backend revision `59922df` and
another isolated native database. The same table-lock and two-connection-loss
injection left one actual streaming completion with confirmed usage, no customer
charge and one open reservation. The client received its requested nonce,
complete SSE termination and usage of 16 input and 8 output tokens.

After stopping the original process, the verifier released the charge-table lock
and held the financial scheduler's transaction advisory lock instead. Two gateway
processes then started against that database, each with a one-connection pool.
Both reached readiness. PostgreSQL statement diagnostics tied to their separate
backend connections independently recorded financial ownership attempts from
both processes. Across a six-second observation with ownership held, all four
progress records remained unchanged; the charge was still absent and the
reservation remained open.

Releasing ownership allowed recovery to proceed:

- Exactly one charge and one debit were recorded, both **9,877 USD nanounits**,
  matching an independent integer calculation from client-reported usage and
  the internal verification rates. The open reservation count became zero.
- All four recovery progress records advanced. Observations stayed within two
  gateway database connections in total; no second pool was introduced.
- Charge reconciliation found no missing, mismatched, unexpected or duplicate
  entries and no settled open reservation.
- After both gateways stopped and one restarted, the database still contained
  one debit and the same one attempt. Temporary access was revoked, the mapping
  and Supplier disabled, and both isolated gateways and PostgreSQL stopped.
  The original development credential identity was unchanged.

This extends qualification to two recovery contenders over one nonempty customer
backlog. It does not prove large-batch traversal, poisoned-row progress, sustained
load, financial-owner loss mid-commit, media/Supplier settlement or absence of
every possible duplicate-egress path. The run used explicit internal credit and
personal upstream access, with no fabricated funding receipt or commercial
Supplier qualification. No fixture outcome supports this evidence.

## Multiple batches with one persistently failing record

A current-input run on 2026-10-10 at backend revision `59922df` generated 112
actual strict-JSON completions through eight concurrent clients. Every response
returned its fresh requested nonce and reported usage. An injected PostgreSQL
trigger rejected customer-charge inserts while a held financial-ownership lock
prevented background recovery. This created 112 confirmed completed attempts,
zero customer charges and 112 open reservations through the actual request path;
no completion, usage or financial rows were inserted by the verifier.

After stopping the gateway, the trigger was narrowed to reject only the first
attempt in UUID order. The ownership lock was released and the gateway restarted.
Independent database observations then established the batching sequence:

| Observed stage | Customer charges | Open reservations | Durable cursor |
| --- | ---: | ---: | --- |
| First 100-attempt batch, one write fault | 99 | 13 | Nonempty |
| Following batch completed | 111 | 1 | Reset after reaching the end |
| Fault removed and failed record revisited | 112 | 0 | Recovery continued |

The single remaining reservation before removing the fault belonged to the
original rejected attempt. Each final charge and debit matched an independent
integer calculation from that request's client-reported usage. The total was
**1,878,701 USD nanounits**. Charge reconciliation reported no missing,
mismatched, unexpected or duplicate entries and no settled open reservation.
A further restart preserved 112 charges and 112 debits. Temporary access was
revoked and the isolated servers stopped; the original database and encrypted
identity were preserved.

This verifies bounded traversal beyond 100 real pending customer charges,
savepoint isolation of a per-record database write error and eventual retry
after its removal. It does not establish handling of malformed immutable
financial inputs, process loss at a nonempty cursor, competing workers over this
larger backlog, other ledgers or sustained production capacity. The trigger was
explicit storage fault injection; upstream responses were actual and no fixture
outcome supports the result.

## Forced process loss with a saved batch cursor

A further current-input run on 2026-10-10, using backend `5a2449d`, repeated the
112 actual upstream completions and charge-write fault above. After independently
observing the first committed batch, the verifier killed the gateway process
with SIGKILL. A database read with the gateway stopped confirmed the exact same
99 charges, 13 open reservations and nonempty recovery cursor. Thus this run
exercised process loss between committed batches, rather than only restarting
before recovery began.

The restarted gateway advanced to 111 charges and one reservation belonging to
the deliberately faulted attempt. Removing the write fault allowed that attempt
to recover too. All 112 charge/debit pairs matched independent calculations from
their actual response usage, totaling **1,884,504 USD nanounits**. There were no
open reservations or reconciliation discrepancies. Another restart preserved
exactly 112 charges and 112 debits. Temporary access was revoked and isolated
processes stopped without changing the original credential or database.

This extends the preceding checkpoint to an abrupt gateway exit with a durable
nonempty cursor. It does not establish crash behavior inside a transaction,
database-server loss, malformed financial input, concurrent recovery over this
larger backlog, or other financial ledgers. The request phase included deliberate
accounting faults and is not a normal-operation performance qualification.

## Foreground priced admission while recovery owns a connection

A current-input native run used two gateways with two shared-pool connections per
process. One actual streamed completion first became a pending charge through the
same observed accounting-connection termination described above. Before recovery,
SQL showed one confirmed completion, no customer debit and one open reservation.

A temporary database trigger delayed only that pending attempt's charge insert
by 1.5 seconds, below the worker's statement timeout. Independent
`pg_stat_activity` inspection identified the gateway actively recovering the
charge. A new priced request for a separate company was then sent to that same
gateway. An independent joined snapshot observed the new attempt's non-null
dispatch timestamp while the recovery backend was still in `PgSleep` inside its
charge insertion. Thus foreground admission acquired another connection from the
same bounded pool while financial work held its claimed connection. The second
gateway was ready throughout; this checkpoint does not independently attribute
ownership attempts to both processes.

The foreground completion returned its newly requested strict JSON marker and
reported usage. After recovery and restart, independently reopening the stopped
database confirmed exactly two completed attempts, two usage-calculated customer
charges and matching debits, with no open hold or funding receipt. The temporary
trigger was removed and both temporary keys revoked. Original development data
and encrypted identity were unchanged.

This verifies overlap for one pending text charge, two-connection pools and a
separate company's foreground admission. It does not reserve foreground capacity,
qualify a one-connection overlap, prove same-account lock independence, or establish
sustained backlog performance. The database delay is explicit storage fault
injection; both upstream completions were actual, not fixture responses.
