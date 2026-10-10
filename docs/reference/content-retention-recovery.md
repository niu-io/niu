# Bounded content-retention transactions

Status: implemented with scoped current-input lock verification, 2026-10-10.
Large expired backlogs and ingestion recovery remain unqualified.

Content expiry now uses a shared background transaction helper. It obtains an
idle connection through the existing pool, tries a database transaction advisory
lock for content retention, and configures a 250 ms lock timeout and a 2 s SQL
statement timeout. A busy pool or another owner skips the operation; timeout or
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
