# Native runtime operations and limits

Reviewed 2026-10-12 for S12-2. The initial isolated operational run used
`1212ea3b68f934c22fff6c62696475d2f628fc6a` (executable SHA-256
`f299e3c484bb1a724fe5e4e9e581d45ef552cf1da496a65ff5dd7fae5868e553`).
The blocked-directory fix and its actual isolated verification used
`c24e75b7f3176f35faa571ea1fca6574c6de050e` (executable SHA-256
`8e5c7ec88128ff58a89fb873415259fe99d3c5244596b6196830884a4c9072e4`).
This consolidates supported native operation and its observed limits. The
blocked-directory defect is resolved for the exercised path; idle restart does
not establish a deadline for all shutdown phases. Fixture outcomes provide no
evidence. Container and frontend acceptance are outside this record.

## Configuration and ownership

| Facility | Implemented limit | Meaning and boundary |
| --- | --- | --- |
| Main database pool | `NIU_DATABASE_MAX_CONNECTIONS`, integer 1–256; default 32 (historical S12-2 runs on 2026-10-12 used the earlier default of 10) | Per Gateway process, shared by admission, reads, financial work and several workers. Not a database-wide connection ceiling. |
| Content maintenance | Separate pool, maximum 1 connection per Gateway | Identified as `niu-content-retention`; additional to the main pool. Multiple Gateway processes each have this allocation. |
| Ordinary pool acquisition | 5-second acquisition timeout and 15-second `idle_in_transaction_session_timeout` (`crates/storage/src/lib.rs`) | Individual callers can impose a shorter timeout. This is not a SQL execution deadline. |
| Shared bounded recording/read transactions | 250 ms lock wait; 2 s statement execution | Includes directory cursor and page reads in one snapshot after `c24e75b7`. Applies after connection acquisition; not a total transaction or universal endpoint deadline. |
| Financial/content background ownership | 250 ms connection wait; nonblocking transaction advisory ownership | A losing contender skips that domain. Financial stages retain one connection for the claimed transaction; contenders may briefly acquire connections. |
| Background scheduling | 5-second interval, missed ticks skipped | Cadence is an implementation setting, not a recovery completion SLA. Ledger pages and retention domains have their own finite batch limits. |
| Inference request configuration | `request_timeout_seconds`, 1–3600; default 300 | Absolute preparation/dispatch deadlines apply on supported inference paths. This setting does not currently impose a universal deadline on administration SQL reads. |
| Request body reception | `request_body_timeout_seconds`, 1–3600; default 30 | Absolute budget from request middleware entry while reading the body, including diagnostics capture and JSON extraction. Receiving another chunk does not renew it. Expiry returns 408 with `request_timeout`; completed-body handler work and response streaming have separate deadlines. See the [2026-10-30 review](../reviews/architecture-review-2026-10-30.md). |
| Text Provider connection and DNS budgets | `provider_connect_timeout_seconds` and `provider_dns_timeout_seconds`, each 1–3600; default 3 | Each is clamped to its caller's HTTP budget. Applies to the five direct text adapters and Supplier connection/catalog checks; existing media budgets remain separate. DNS resolution precedes the HTTP request budget, so these are not a universal end-to-end deadline. |
| Admission/completion writer queues | 4,096 entries each, maximum batch 64; four in-flight batches per writer | Three writer queues share the main pool. Queue bounds do not establish saturated throughput or a total drain deadline. |
| Diagnostic shutdown phase | At most 10 seconds after HTTP and writer drain | A timeout logs a sanitized pending-write warning. It is not a ten-second limit for the entire shutdown. |

Pool size and request-timeout values outside their ranges are rejected at startup;
they are not silently clamped. Current native execution rejected main-pool values
0, 257 and noninteger input, and request-timeout values 0 and 3601. Restoring valid
settings allowed readiness again without changing saved product data.

## Current restart and connection checkpoint

A stopped copy containing actual model completions, charges and saved policies
started with the retained executable and a main-pool limit of two. Eight client
threads issued 64 actual balance reads; each response matched the independently
reopened ledger balance. PostgreSQL observation excluded the verifier connection
and found at most three Gateway sessions: two shared-pool sessions and one content
maintenance session. This demonstrates the exercised per-process allocation, not
peak capacity or a global multi-Gateway cap.

After completed reads, SIGTERM produced a clean exit. Restart returned the same
actual balance, followed by another clean stop. Original full-row fingerprints
for attempts, charges, ledger entries, funding, reservations, costs, Supplier
earnings, keys, policies, denial records, credentials and model mappings were
unchanged. No new upstream request, fabricated funding or financial entry was
created. All isolated processes stopped; the original service was kept running.

## Observed blocked-read shutdown defect and fix

A separate stopped copy received an authenticated workspace-directory request
while PostgreSQL held an exclusive lock on `projects`. Independent activity
inspection identified the real directory SELECT waiting for that lock. After
SIGTERM, saved observations showed the process alive, request pending and lock
held beyond ten seconds; the last such observation was approximately 11.97
seconds. Explicitly terminating the locking PostgreSQL session and confirming
lock release allowed the original directory response to return HTTP 200. The
Gateway exited cleanly approximately 12.59 seconds after SIGTERM and restarted
with unchanged records.

The original directory query used an ordinary pooled read without the shared
bounded transaction helper. HTTP graceful drain waited for that query; the
later diagnostic timer did not bound this earlier wait.

Implementation `c24e75b7` reads the directory cursor and page in one shared
bounded read-only transaction. A fresh stopped copy retained the real lock while
current page, cursor, workspace-alias rename and alias-delete requests each
returned safe 503 responses in approximately 254–256 ms. No SQL or lock details
entered the responses. SIGTERM then exited cleanly in approximately 9.45 ms while
the independently confirmed locking session and its lock remained active. These
are specific observations, not promised latency or shutdown SLAs.

After explicit lock release, complete one-entry cursor traversal matched the
actual full directory and ordering. Workspace rename did not move the cursor
ordering. An authorized reader saw only its own workspace; a foreign cursor
returned 409, reader mutation returned 403, and an inference key could not read
the management directory. A genuinely empty workspace was created, renamed and
deleted; a workspace containing actual saved business records retained its 409
deletion refusal. Restart returned the original directory. Independent reopening
verified original project, business, policy, credential and model records; the
new temporary reader and inference key were revoked. A revoked operator remains
saved metadata, so its workspace must not be called empty merely because the
operator can no longer authenticate.

The change does not impose a global shutdown timer, alter pool acquisition,
truncate in-flight model work or qualify every stalled HTTP body and financial
writer. Never promise an overall ten-second shutdown or discard unknown work to
force a fast exit.

## Migration, backup and identity

The existing native service reports schema 0284, readiness and matching local
routing configuration for the retained implementation. Its recorded update
preserved original configuration, encrypted credential identity/revisions and
saved-data counts. Both the pre-update schema-0283 archive and the original service's additional
post-update schema-0284 archive were independently restored and compared across
seven selected saved-data tables: vendors, workspaces, organizations, customer
ledger entries, media jobs, media transport timings and Chat sessions. Archive
SHA-256, restored schema and full-row fingerprints were checked privately. This
scope is narrower than an all-table, all-sequence migration/recovery proof.

A separate current-input video-refusal database migrated to 0284, was dumped and
restored, and retained independently compared job, request and financial records.
That disposable restore is separate from the original service's post-update
backup. Inspect actual archive digests, restored schema and saved
artifacts before making a stronger restoration claim. Preserve the existing
encryption key and identities; a successful schema update does not permit a
reset, overwrite or automatic upstream replay.

## Supported recovery records

| Operation | Actual record | Qualification boundary |
| --- | --- | --- |
| Pending diagnostic drain | [Graceful request diagnostics](graceful-request-diagnostics.md) | Independently reopened historical real completions retained exact usage/debits; release-before-exit preserved complete timing/payload records, while timeout retained missing diagnostics. Historical executable pins were not recovered for this consolidation. |
| Financial backlog restart | [Actual customer backlog](financial-backlog-restart-live.md) and [coordination](financial-recovery-coordination.md) | Nonempty real completion backlogs and saved traversal were exercised. This is not proof of every ledger, commit-loss interleaving or a production recovery SLA. |
| Saved video recovery | [Automatic recovery](current-video-automatic-recovery.md) and [submission restart](current-video-submission-restart.md) | Personal upstream-funded saved jobs retained their original route/results without duplicate submission. Paid media settlement and Ark asset reuse require separate evidence. |
| Content cleanup | [Bounded retention](content-retention-recovery.md) and [video jobs](video-jobs.md) | Actual retained-content and expired-video checks have scoped evidence. Large backlogs, every poison-row case and all ingestion transitions remain unqualified. |

SIGKILL, host loss or a diagnostic write exceeding its drain window can leave
missing diagnostics. A timeout or observation failure does not establish that a
transaction did not commit. Reopen authoritative records; preserve unknown
execution and liability, and recover from durable evidence. Pending ordinary
asset ingestion is not automatically resubmitted.

The supported operational inventory is finite: pinned native startup, identity
preservation, migrations, independently restored backups, saved-state recovery,
observed connection allocation, actual graceful drain behavior and explicit
limits. Whole-process shutdown deadlines and arbitrary failure interleavings are
not qualified by this record. Increasing load, overload recovery and comparative
capacity belong to S12-3 after business acceptance.

## Original native service update after the directory fix

After the isolated current-input checks, the original service was refreshed to
retained executable `c24e75b7`, schema 284. Its executable digest matched the
retained build before launch. Original configuration file digests, encrypted
credential identities/revisions and durable business counts remained unchanged;
readiness returned 200 and authenticated routing configuration matched. Actual
one-entry cursor traversal of the original service matched its native workspace
count without emitting identifiers or names. No original database reset, new
model generation or encryption-key replacement occurred.

S12-2 closes the fixed finite operations inventory and supported scoped evidence
above. This does not establish a global shutdown deadline, every failure
interleaving, production capacity or full release acceptance. Those observations
must not be inferred from the specific read-lock fix or idle shutdown run.

## Current diagnostic and payment runtime refresh

Retained native `13952e57ddde7c8aad3d16c4ddf8361191fda97a` compiled from
a clean committed archive and replaced the earlier retained executable after
its binary digest and rollback availability were checked. The existing process
environment, database, configuration and encryption identity were reused. Actual
readiness returned HTTP 200; configuration digests, encrypted Supplier credential
identities/revisions and retained organization, workspace, video-job and ledger
counts were unchanged. Schema remains 287. This refresh does not qualify the
new payment terminal-status branch with a genuine paid/closed HTTP example.

The [actual connection-budget checks](provider-timeout-configuration-acceptance.md)
and [durable transport-phase checks](request-transport-phase-acceptance.md) retain
their own execution pins and scopes. Historical unknown phases are not backfilled.
The original installation retains its default connection budgets; only isolated
verification copies used explicitly longer budgets.

## Media configuration runtime and fresh backup restoration

The original native service now runs retained executable
`4c3def6381e839d1206d5dd13b3b42632b0ef036`, schema 287. The refresh reused
the existing process environment, configuration, database and encryption identity;
readiness returned HTTP 200. Configuration digests, encrypted Supplier credential
identities/revisions and retained business counts remained unchanged.

On 2026-10-13, its fresh native archive was restored into a newly initialized,
isolated PostgreSQL instance. The archive digest and restored migration version
were checked independently. Full-row fingerprints matched the current original
organizations, workspaces, encrypted Suppliers, balance entries, video jobs,
media transport timings and saved Chat sessions. The verification database was
stopped afterward. No original records were overwritten, no upstream requests
were issued and no encryption identity was replaced. This verifies the exercised
backup restoration; it does not establish media policy enforcement, paid media
settlement or performance capacity.

The subsequent original-service refresh uses retained executable
`7e42a43b1ea82ef39aaa3b7265109e3937b5ad9e`, schema 288, after isolated actual
media-policy refusal/migration/restart checks. Its target and retained binary
digests matched and the prior executable remained available for rollback. The
exact running environment was retained; readiness returned 200 and original
configuration, encrypted credential identities and retained business counts were
unchanged. The fresh schema-288 archive was independently restored into another
new PostgreSQL instance, with the same seven complete saved-record fingerprints
matching the original source. Verification instances were stopped. Media receipt
creation, Provider handoff and dispatch enforcement remain unqualified.
