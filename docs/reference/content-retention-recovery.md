# Bounded content-retention transactions

Status: implemented with scoped current-input lock verification, 2026-10-10.
Large expired backlogs and ingestion recovery remain unqualified.

Content expiry now uses a shared background transaction helper. It obtains an
connection through the existing pool with at most a 250 ms acquisition wait, tries a database transaction advisory
lock for content retention, and configures a 250 ms lock timeout and a 2 s SQL
statement timeout. An acquisition timeout or another owner skips the operation; SQL timeout or
failure rolls back that retention transaction. Transaction completion or process
loss releases ownership. Claim contenders briefly use their own pool connection.

The helper covers retained request payloads, asset group create/read/update
content, asset listing/lookup results, inspected-image source content and saved
media result references. Existing retention predicates and erasure records remain
in their domain modules. Independent expiry domains are still attempted after a
failure in an earlier one. Inspected-image erasure keeps its marker and deletion
in one transaction. Media result expiry now processes at most 500 references in
expiry order with `FOR UPDATE SKIP LOCKED`, rather than updating the full expired
set in one statement.

Financial recovery shares the connection/timeout implementation but uses its
own ownership key. Content maintenance and financial recovery remain independently
scheduled. This is not one global connection allowance for all background work:
one owner in each group may run concurrently, and payments, video polling and
interrupted ingestion/read recovery are outside this retention claim.

## Current-input observations

An independent PostgreSQL transaction held a SHARE lock on the actual request
payload table. The verifier first observed the runtime cleanup DELETE waiting
on that exact backend. One second later, the DELETE was no longer waiting even
though the blocking transaction remained open, and the gateway had logged its
cleanup-retry warning. No application-side future timeout was used to simulate
this result.

The saved, unexpired large Embeddings capture retained its original hash and
remained readable through the authorized payload API. After gateway restart, an
actual refresh and download of the saved owner-funded video matched the original
SHA-256 and byte count and decoded fully; foreign access and access after key
revocation were denied. No additional submission or financial entries appeared.
The customer-charge progress-row contention check also retained stage isolation
and safe stage-specific logging with the shared transaction helper.

All-target Clippy, release compilation, formatting and public-tree checks
completed. Fixture outcomes are not evidence. These observations do not verify
multi-instance contention over a nonempty expired backlog, all expiry boundary
races, statement-timeout CPU workloads, interrupted ingestion recovery, paid
settlement or capacity. Cleanup limits are implementation bounds, not measured
throughput guarantees.

## Progress with a single database connection

A current-input run on 2026-10-10 exposed starvation between consecutive
retention domains. An isolated gateway with a one-connection pool completed two
actual, internally credit-backed OpenRouter requests and captured their payloads.
After shortening one captured row's expiry in the isolated database, multiple
scheduled passes left it unerased for at least 30 seconds. The other payload was
still unexpired. No synthetic request or financial rows were inserted.

Source inspection identified a connection-lifecycle gap: SQLx 0.8.6 normally
returns a dropped pooled connection asynchronously. After one cleanup committed,
the next nonblocking acquisition could miss the still-returning connection;
repeating the same domain order could starve later domains. The statement-based
retention helper now borrows its transaction from an explicitly held pool
connection and awaits SQLx's connection return before continuing. That return
also flushes rollback after a domain error. Ownership and deadline configuration
remain shared with financial recovery. That checkpoint retained try-only
acquisition; the subsequent financial-backlog correction below replaces it with
a bounded pool wait. Each domain retains its own transaction.

With the rebuilt release binary, a fresh isolated current-input run verified:

- Two actual upstream completions produced captured content and independently
  checked customer charges. The expired capture was physically removed after
  3.62 seconds; the fresh response retained its original SHA-256.
- Expiring the remaining capture while the gateway was stopped, holding its row
  lock, then restarting preserved it through a six-second scheduled-worker
  observation. After releasing the lock, the capture was physically removed.
  Both attempts and both customer charges remained present.
- The credit workflow reconciled charges of 20,371 and 12,099 USD nanounits,
  retained its paid statement,
  rejected an additional external payment and an exhausted-key request, applied
  one idempotent refund, and preserved accounting through another restart.
  This used explicit internal verification rates and approved credit, not an
  external top-up or a claim of commercial Supplier qualification.
- Temporary access was revoked and the isolated gateway/database stopped. The
  original development database and encrypted credential identity were preserved.

This establishes progress and accounting preservation for two real captures in
the stated small-pool scenario. It does not establish fairness under sustained
foreground saturation, all background workers' progress, large-backlog capacity,
or a root cause for every GitHub Actions failure. Fixture outcomes are not used.

### Shared runner follow-up

The [single-connection financial backlog](financial-recovery-coordination.md#small-pool-recovery-and-bounded-acquisition)
exposed repeated misses between independently scheduled workers even after eager
connection return. All claimed background transactions now share one runner with
a 250 ms acquisition timeout and explicit return, retaining separate transactions
and ownership groups. The two-real-capture scenario was repeated with this
runner: expiry completed in 3.51 seconds, the fresh hash and charges were
preserved, and row-lock skipping followed by deletion still worked. This
supersedes the earlier try-only acquisition policy; no broader fairness or
performance guarantee is implied.
