# Bounded content-retention transactions

Status: implemented with scoped current-input lock and foreground verification,
updated 2026-10-11. Large populated backlogs and poison-row progress remain
unqualified; later sections distinguish the exercised recovery paths.

Content expiry now uses a shared background transaction helper. It obtains a
connection through the existing pool with at most a 250 ms acquisition wait, tries a database transaction advisory
lock for content retention, and configures a 250 ms lock timeout and a 2 s SQL
statement timeout. An acquisition timeout or another owner skips the operation; SQL timeout or
failure rolls back that retention transaction. Transaction completion or process
loss releases ownership. Claim contenders briefly use their own pool connection.

The helper covers retained request payloads, asset group create/read/update
content, asset listing/lookup results, inspected-image source content and saved
media result references, plus interrupted asset-image ingestion and ingested-image
read recovery. Existing retention predicates and erasure records remain
in their domain modules. Independent expiry domains are still attempted after a
failure in an earlier one. Inspected-image erasure keeps its marker and deletion
in one transaction. Media result expiry now processes at most 500 references in
expiry order with `FOR UPDATE SKIP LOCKED`, rather than updating the full expired
set in one statement.

Financial recovery shares the connection/timeout implementation but uses its
own ownership key. Content maintenance and financial recovery remain independently
scheduled. This is not one global connection allowance for all background work:
one owner in each group may run concurrently, and payments and video polling
remain outside this retention claim. Advisory-lock contenders can briefly hold
additional pool connections; the shared owner is not a strict global cap of one
checked-out connection across processes.

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

## Interrupted image recovery shares content ownership — 2026-10-11

Interrupted asset-image ingestion and ingested-image readiness now execute their
existing bounded SQL through the content-maintenance transaction helper. They
share its cross-process advisory owner, bounded connection acquisition, 250 ms
lock timeout and 2 s statement timeout. Their existing 16-row `SKIP LOCKED`
selection, age threshold, conflict handling and uncertainty outcomes are unchanged.
They do not redispatch upstream work. A failed domain returns its connection and
does not stop the caller from attempting the next domain.

A fresh native PostgreSQL database ran two gateway processes. An independently
held content-owner advisory lock prevented either interrupted-image recovery SQL
from entering while both processes ticked. With that owner released and both
outcome tables held by an external transaction, independent activity sampling
observed at most one blocked recovery statement at a time. Both gateway readiness
endpoints remained responsive. Both recovery stages emitted retry diagnostics,
and releasing the table locks restored normal operation. Independent reopening
confirmed empty claims/outcomes and no inference or ledger records.

This actual contention run verifies the exercised ownership and blocked-domain
behavior on empty queues, not populated recovery, poison-row traversal, priced
admission under backlog or sustained capacity. Claim checks can briefly occupy
connections in competing processes; the owner bound is not a reservation of
foreground capacity. Payment/video polling remains outside these ownership
groups. Issue #13 remains open for its complete acceptance scope. Fixture
outcomes were not used as evidence.

### Actual priced foreground calls during image-recovery contention

A separate fresh native run configured two gateway processes with two database
connections each. Both image-recovery outcome tables remained locked by an
external transaction. Once PostgreSQL activity showed a claimed recovery
statement waiting on those locks, concurrent clients submitted one real
OpenRouter strict-JSON request through each gateway. The table locks remained
held until both responses had been received and inspected. Each response returned
the requested fresh marker and provider-reported usage.

Independent reopening confirmed exactly two completed attempts, two customer
charges and two matching debits. Each charge was recalculated from its retained
response token counts and pinned customer rates; customer reservations were
released. Recovery owner exclusion and at-most-one sampled blocked recovery
statement remained intact, and both readiness endpoints stayed available.

This used the saved personal upstream account, explicit internal tariffs and
approved internal credit, not external funding or commercial supply. The image
recovery queues were empty: this establishes foreground progress during the
exercised lock contention, not recovery of a populated backlog, poison-row
fairness, sustained load or a production admission guarantee. No fixture result
supports the observation. Isolated processes stopped and original development
data and encrypted identity were preserved.

## Request-payload retry isolation implementation

Migration 0238 adds content-free retry scheduling for request-payload cleanup.
The cleanup function selects at most 64 eligible expired rows, locks them with
`SKIP LOCKED`, and uses one PostgreSQL exception subtransaction per deletion.
Constraint violations, invalid data and explicit row-trigger exceptions defer
that row for 60 seconds without rolling back successful neighboring deletions.
The retry deadline is stored in PostgreSQL and survives Gateway replacement.
Successful or explicit deletion cascades removal of its retry metadata.
Infrastructure errors and statement deadlines still abort the bounded batch.
The existing content-retention advisory ownership and timeout policy remain.

This change covers request payloads only. Other content domains still need their
own row-level isolation. It does not resolve the strict cross-Gateway connection
bound: contenders still acquire a connection before trying the advisory claim.
Nonempty naturally expired and poisoned-row runtime acceptance remains pending;
compilation or fixture outcomes do not establish those behaviors.

A fresh isolated native database applied this migration and served actual
structured and streamed OpenRouter requests. Both unexpired request-payload
records remained after an explicit cleanup invocation and Gateway restart; the
cleanup returned zero and created no retry records. Independent database reopening
confirmed those records and reconciled both actual usages, charges and refunds.
This verifies installation and the exercised unexpired-row boundary, not the
pending naturally expired or poisoned-row cases. The existing development
database was not migrated during this verification.

## Media-result retry isolation implementation

Migration 0239 applies bounded per-row exception handling and durable 60-second
retry eligibility to media-result expiry. It processes at most 64 eligible rows
under the existing content owner and deadlines. Successful expiry erases only
ciphertext and records deletion; immutable identity, expiry and tombstones remain.
An explicit result deletion also removes its retry marker through a trigger.
No result URL or database error text enters retry metadata. Row data/constraint
failures defer that row; infrastructure failures still abort the batch.

The original retention eligibility remains unchanged. This implementation does
not yet isolate failures in asset or inspected-image batches, or satisfy the
strict cross-instance connection-count requirement.

## Inspected-image retry isolation implementation

Migration 0240 moves inspected-image expiry into a bounded database function.
It retains the existing 16-source limit, expiry ordering and source-row
`SKIP LOCKED` claim. Each source's immutable erasure marker and ciphertext
deletion share one exception subtransaction. A row data or constraint failure
rolls both back and stores a content-free retry deadline 60 seconds later,
allowing successful neighbors to commit. Statement deadlines and infrastructure
errors still abort the bounded batch. Deleting retained content, including
explicit erasure, cascades removal of its retry metadata.

The existing content-owner claim and transaction deadlines remain unchanged.
This is an implementation checkpoint, not evidence of populated image cleanup
or complete issue #13 acceptance. Asset-result batches and interrupted image
outcome batches still need their own row-failure isolation. The strict global
connection bound remains unresolved.

A fresh isolated native Gateway installed migration 0240, invoked the empty
cleanup function and rejected an actual fresh PNG upload without authorized
inspection prerequisites before and after restart. Independent database reopening
confirmed migration 0240, empty retry state and no image approval, saved source,
inference or charge from that refusal. Separately, the rebuilt Gateway served
actual structured and streamed OpenRouter requests through the internal-credit
workflow, including concurrent partial refunds and restart. Independent reopening
matched both token usages, exact charges/debits and refunds, with no held
reservations. These observations verify installation and those exercised paths;
there was no approved retained image available to establish nonempty image
cleanup, poison-row progress or its explicit-erasure cascade. The original
development database was not migrated during this checkpoint.

## Restored nonempty backlog and payload fault recovery

A historical development-database backup was restored into a fresh isolated
native PostgreSQL instance. Original content and retention timestamps were left
unchanged. At execution time it contained 15 naturally expired request payloads
and three naturally expired retained media references. The new Gateway applied
the pending migrations while an external advisory owner temporarily prevented
background cleanup from racing preparation of the verification.

A temporary trigger rejected deletion of one expired payload. After releasing
the advisory owner, the actual Gateway background loop removed the other 14
payloads and erased all three media ciphertexts. The failed payload remained with
a future retry deadline. Restart preserved both. After removing the fault and
waiting for the real 60-second delay, background recovery deleted the final
payload and its retry record. Repeating both cleanup functions returned zero.

Independent reopening confirmed the expired payload backlog was absent, media
tombstones remained without expired ciphertext, and both retry tables were empty.
The original database was untouched. This provides nonempty cleanup and payload
poison-row/restart evidence. A poisoned media row, active media references,
multi-Gateway nonempty contention and the other content domains remain unverified.

### Media poison-row recovery

A separate fresh restore used the same naturally expired backup records and a
trigger that rejected erasure of one media reference. The actual background loop
removed all 15 expired payloads and erased the other two media references. The
failed media ciphertext remained, with a future retry deadline. Gateway restart
preserved it. After removing the fault and waiting for the actual retry deadline,
background maintenance erased the final ciphertext and removed its retry marker.
Repeated payload/media cleanup returned zero.

Independent reopening verified the absence of expired payloads and media
ciphertext, retention of media tombstones, and empty retry tables. No retention
or retry timestamp was rewritten. This exercises a media-row failure separately
from the payload-row failure above; it still does not qualify multi-Gateway
nonempty contention, active media preservation or other asset cleanup domains.

### Two-Gateway nonempty cleanup overlap

Another fresh restore started two Gateway processes against the same database;
both readiness endpoints responded before the external content-owner lock was
released. One media-row fault remained active during concurrent background
maintenance. All 15 expired payloads and the other two media references were
cleaned. Both processes were stopped, one restarted, and the failed media row
recovered after fault removal and its real retry delay.

Private verification triggers recorded successful payload deletions and media
ciphertext erasures. Independent reopening reconciled exactly 15 payload events
and three media events, with each domain/record identity appearing exactly once,
retained media tombstones and no remaining retry markers. This demonstrates no
duplicate successful mutation in the exercised two-process run; it does not
claim both processes won a batch, bound transient connection acquisition, or
measure priced admission under this backlog.

### Priced foreground requests while a failed cleanup remains queued

A further isolated restore started with 15 naturally expired payloads and three
expired media references. Two Gateways processed maintenance while a temporary
trigger rejected one media erasure. After the other expired rows were cleaned,
one real OpenRouter structured request was submitted through each Gateway
concurrently, using a newly created workspace key and explicit internal credit
and customer tariffs. Both responses returned their fresh requested markers.
The failed expired media ciphertext remained queued before and after those calls.

After Gateway replacement, removing the fault and waiting for the real retry
deadline allowed the last media erasure to complete. Independent reopening of
PostgreSQL verified each cleanup identity was mutated exactly once, retained
media tombstones, empty retry tables, and no expired payload or media ciphertext.
It also matched both responses' usage and key attribution, recalculated both
customer charges, matched their scoped USD debits, and confirmed released
reservations and revocation of the temporary key.

This verifies foreground progress while a failed expired item remains queued.
The successful neighboring cleanup had already completed before inference;
the run does not establish simultaneous active cleanup/dispatch, a strict global
connection limit, sustained admission fairness or a large-backlog throughput
bound. Internal credit is not external funding or commercial supply evidence.

## Existing native-runtime upgrade

The existing development database was backed up in PostgreSQL custom format and
its archive inventory checked before applying migrations 0238 and 0239. The
Gateway restarted on its existing address and became ready with migration 0239
recorded. Configuration hashes, Supplier credential ciphertext/revisions and
organization, workspace, media-job and customer-ledger counts matched their
pre-upgrade values. No database or encryption identity was replaced.

Current saved-video history/billing and session authorization reads were repeated
without new submission or financial entries. A fresh personal OpenRouter stream
then returned its requested nonce and reported usage through the updated native
Gateway. Independent SQL matched completed status and both token counts,
confirmed the temporary key was revoked and found no customer debit for that
personal request. Backup inventory readability is not a restore verification of
this new archive; historical-backup restore evidence is described separately
above. This checkpoint does not qualify customer-funded video settlement.
