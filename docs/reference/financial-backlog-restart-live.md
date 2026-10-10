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
