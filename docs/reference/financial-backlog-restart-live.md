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
