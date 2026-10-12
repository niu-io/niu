# Current automatic video recovery after rotation and restart

Current-input checkpoint on clean backend `e704955`, reviewed 2026-10-12.
Fixture outcomes provide no evidence. This is personal owner-funded video
execution, not customer-paid settlement or commercial Supplier qualification.

## Actual worker-driven recovery

A refreshed authenticated upstream model inventory confirmed the saved model's
requested one-second, 480p and 16:9 controls. A fresh isolated native database
migrated through 0279; management configured explicit personal credential
ownership, a private video mapping and a no-expiration workspace key.

The key submitted one actual video using a fresh idempotency identity. Niu saved
the upstream job reference. Before polling, the key was rotated and the Gateway
stopped. The replacement started with `NIU_VIDEO_POLLING=true` in this isolated
environment. The client only used GET to observe saved state; it issued no refresh.

Eleven saved-state reads followed unknown, queued and succeeded status. Native
transport records show three worker upstream queries and exactly one submission.
The first query began after the old key's revocation. Success was observed 30.58
seconds after client monitoring began; this includes polling cadence and transport
and is not a measured Provider generation duration.

The result API delivered a 94,898-byte MP4, inspected with FFprobe and fully
decoded with FFmpeg. Original and replacement keys retained no automatic expiry;
the old secret was denied. Identical submission replay returned the same completed
job, changed input returned 409 and submission count remained one. A later restart
preserved saved observations and confirmed completion. Replacement revocation
returned 401.

## Independent final-artifact verification

A separate process reopened the stopped database and checked:

- One attempt, media job and submission identity; confirmed completed execution.
- Canonical request/idempotency digests and the original key attribution.
- Both keys store positive timestamp infinity, share one rotation lineage and
  remain revoked.
- Every retained client state-response digest and saved status, native worker
  query count and first-query timing after original-secret revocation.
- Immutable queued/succeeded observation fields and ordering, with missing
  reported quantity kept explicit.
- Finished schedule marked stopped, zero failures and cleared lease fields.
- Final file hash/size, actual nonempty video stream and independent full decode.
- No customer/media charge, ledger, funding or Supplier earning entry and no
  open customer/procurement hold.

There was no explicit client refresh, second paid submission, fabricated usage,
funding receipt or commercial review. Original installation configuration,
databases and encrypted identity were preserved; polling was enabled only for
the isolated run. Raw requests/responses, credentials and video bytes remain
private and outside Git.

## Boundary

This verifies the exercised automatic personal-video polling and completion,
no-expiration key rotation/restart, result delivery, schedule termination,
idempotent replay/conflict and revocation. It does not qualify customer-paid
metering, automatic financial settlement, every policy/revocation interleaving,
reference images, natural result expiry, multi-instance worker contention,
connection isolation or production capacity. No CPU/RSS profile was collected.
Personal upstream charges are separate from absent Niu customer/Supplier entries;
this is not a claim that the generated video was free.

## Bounded scheduling waits

A separate current-input checkpoint exercised clean backend `d104367` against
a stopped copy of the actual completed video history. With automatic polling
enabled and one admission connection, an independent session held an exclusive
lock on the schedule table. The previous executable left a saved-job GET pending
until lock release (1,614.50 ms in this observation). The revised worker released
its connection after the transaction-local lock timeout; the GET returned the
same authorized saved job while the table lock remained held, in 236.08 ms.
This is a contention observation, not a throughput or latency SLO.

Schedule reconstruction, lease claim and lease completion now use the existing
bounded transaction helper. Access resumption and insertion are committed
atomically. Candidate selection, lease conditions and retry policy are unchanged;
no upstream request runs inside these transactions. Financial recovery logic
and database pool sizes are unchanged.

Independent reopening confirmed unchanged full attempt, job and schedule rows,
transport and ledger counts, exactly one original submission, stopped scheduling
with cleared leases, restart visibility and denied revoked-key access. This
qualifies the exercised schedule-table contention only; it does not establish
global worker connection isolation or every background task's deadline.
