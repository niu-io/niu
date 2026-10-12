# Current video submission, key rotation and restart

Current-input checkpoint on clean backend `e704955`, reviewed 2026-10-12.
Fixture outcomes provide no evidence. This is personal owner-funded video
execution, not customer-paid media settlement or commercial Supplier qualification.

## Actual submission and recovery

A current authenticated upstream model inventory confirmed the saved model still
supports the requested one-second duration, 480p and 16:9 controls. A fresh
isolated native PostgreSQL database migrated through 0279. Management configured
the saved personal OpenRouter credential, explicit personal ownership and a
private video mapping; no Supplier agreement, funding or customer rate was invented.

A no-expiration workspace key submitted one fresh text-video request with a
unique idempotency identity. Niu returned 202 and persisted the upstream job
identity. Before any refresh, management rotated the key and stopped/restarted
the Gateway. The old secret returned 401; the replacement recovered the saved
job without another creation request.

Seven explicit refreshes followed the original upstream job to succeeded status.
The first observed queued status; the final success was observed 20.75 seconds
after refresh monitoring began. This client observation includes polling cadence
and transport, not a measured Provider generation duration. Automatic upstream
polling was disabled. Native records contain exactly seven query spans and one
submission span; the first query started after the old key's revocation.

Replaying the same body/identity returned the existing succeeded Niu job.
Changing the request body under that identity returned 409. Submission count
remained one. Saved query observations contain queued and succeeded receipts,
both retaining missing quantity. The result API delivered a 110,772-byte MP4;
FFprobe inspected its actual video stream and FFmpeg fully decoded the file.
Billing remained owner-funded. A further restart preserved the saved observations
and completed execution. Revoking the replacement returned 401.

## Independent final-artifact checks

A separate process reopened the stopped database and verified:

- One attempt, job and submission identity, with confirmed completed execution.
- Request and idempotency digests bound to the original job, without another POST.
- Original/replacement keys store positive timestamp infinity, share the same
  rotation lineage and remain revoked; the attempt retains its original key.
- Every saved refresh response digest/status and the native query-span count,
  including first-query timing after old-key revocation.
- Complete observation ordering/fields match immutable native receipts;
  missing quantity remains explicit rather than becoming one second or zero.
- Downloaded byte count/hash, actual nonempty video stream and independent full
  decode. No quality or exact pixel/duration conformance claim follows from this.
- No customer charge, media charge, ledger entry, funding receipt, Supplier earning
  or open customer/procurement hold was created.

Original installation databases, configuration, encrypted identity and previous
source artifacts were preserved. Private credentials, raw requests/responses and
video bytes remain outside Git.

## Boundary

This qualifies the exercised new personal video submission and saved-job recovery
with no-expiration key rotation/restart, explicit refresh, result delivery,
idempotent replay/conflict and revocation on this revision. It does not qualify
customer-paid media, reported billable units, natural result expiry, reference
images, every concurrent policy change, automatic polling recovery or capacity.
Personal upstream charges are separate from Niu customer/Supplier financial
records; their absence does not mean the upstream video was free.
