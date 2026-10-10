# Shared key spending cap: current-input concurrency verification

Date: 2026-10-10. This is a bounded business-concurrency checkpoint, not a
throughput or production-capacity result.

## Actual defect and correction

Four simultaneous requests used the same API key across two gateway processes
connected to one isolated native PostgreSQL database. Each request carried a fresh
strict-schema prompt to the owner's self-funded OpenRouter model. Credit and
internal verification rates followed the [credit workflow](internal-credit-workflow-live.md);
no external funding receipt or commercial Supplier qualification was created.

Before the change, one request completed, two returned the expected key-spending
HTTP 402, and one returned storage HTTP 503. The PostgreSQL server log recorded a
deadlock between two account-row `FOR UPDATE` queries. This diagnosis came from
actual requests and database diagnostics, not fixture outcomes.

Atomic admission inserts the attempt/account foreign-key binding before reserving
balance. Source inspection identified the account lock upgrade after that binding
as the cycle: concurrent transactions held compatible key-share locks and then
requested mutually blocking stronger locks. Reservation now uses
`FOR NO KEY UPDATE OF c`. It still serializes reservation decisions and conflicts
with account policy/funding locks, while allowing foreign-key key-share locks;
reservation does not change account key columns. This follows PostgreSQL's
[documented row-lock compatibility](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS).

The change is in the shared balance-reservation helper. Atomic admission, tenant
scope, balance arithmetic, cap enforcement and the single transaction are retained.
No retry of an upstream call was added.

## Current-input verification after the change

The key cap was 284,445 USD nanounits: enough for exactly one configured maximum
input/output reservation. Four simultaneous requests were split between two
gateway processes; the second used a two-connection pool.

- One request returned HTTP 200 with valid structured output and reported usage
  of 50 input and 12 output tokens. Three returned HTTP 402 with
  `key_spending_limit_exceeded`; none returned storage 503.
- Independent database reads found one attempt, one customer charge and one
  matching debit of 18,025 nanounits, equal to a separate integer calculation from
  client-reported usage and the configured customer rates. No balance hold remained.
- The charge reconciliation response had no missing, mismatched, unexpected or
  duplicate sources and no settled open hold. The PostgreSQL log contained no
  deadlock diagnostic in this run.
- A subsequent request was rejected because the remaining cap could not cover
  another maximum reservation. Both processes were then stopped, one restarted,
  and the same key was still rejected with the same cap error. No additional
  attempt was created.
- The temporary key was revoked and the isolated mapping and Supplier disabled.
  Both gateways and their isolated PostgreSQL server were stopped. The original
  development database and encrypted credential identity were preserved.

Rust release compilation, static checks and public-boundary checks completed.
The rebuilt main development gateway reached database readiness. No fixture
outcome supports the diagnosis or the verification.

This covers one key, one shared account and one four-request interleaving with
actual upstream execution. More keys/workspaces, concurrent policy changes,
rotation during dispatch, long-running contention and production throughput
remain separate qualification work. It does not establish a GitHub Actions root
cause or claim that every CI failure is fixed.
