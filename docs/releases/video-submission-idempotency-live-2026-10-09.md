# Live text-video submission idempotency

Date: 2026-10-09. Optional workspace-scoped `Idempotency-Key` now binds a
text-video request to one durable attempt. This supersedes the earlier blanket
[header rejection](video-idempotency-rejection-2026-10-09.md).

## Implementation

Additive migration 0204 stores only key/request SHA-256 digests and the original
attempt binding. The unique workspace/key constraint arbitrates concurrent
creators; the deferred tenant-scoped foreign key commits identity, operation and
attempt together. The immutable binding never expires into permission for another
generation. Only the first committed creator receives dispatch rights.

Both public inference and dashboard-key endpoints share this identity. Replay
returns HTTP 202 with the original reference and current saved status, including
an unresolved reference before dispatch. Different input returns HTTP 409.
Object keys are sorted recursively before hashing; array order and explicit
document values remain significant. Authentication and current model grants
precede lookup. JavaScript `video.jobs.create` accepts `idempotencyKey`.

Only text-only requests currently support this header; reference-image input is
explicitly rejected before inspection. Unkeyed requests retain their prior
non-idempotent behavior. Interrupted preparation is never taken over or dispatched
by a retry: it may remain `submission_unknown`. At-most-once submission does not
promise successful generation or automatic resolution of all interruptions.

## Current-input evidence

Using the running gateway, its PostgreSQL database and the personal OpenRouter
video mapping:

- Four concurrent requests across public and dashboard-key creation returned
  one job identity. The original upstream job completed successfully.
- Different text under the same key returned HTTP 409. Reordering object fields
  returned the original job. An initial live check exposed order-sensitive
  hashing; the implementation was corrected and the final concurrent run used
  canonicalized documents.
- After gateway restart, the built JavaScript SDK submitted the same document
  and identity, recovering the original completed job.
- Independent PostgreSQL inspection found one attempt, one identity, one bound
  upstream job and one submission transport span for that run, with no customer
  balance entry.
- The actual result was downloaded, hashed and fully decoded with FFmpeg.
- Empty, oversized, whitespace-containing and duplicate headers returned HTTP
  400. Rotating the key made the old credential return HTTP 401; the replacement
  key recovered the same submission identity. Temporary credentials were revoked.

A private database backup preceded migration. No original database or encryption
identity was replaced. Credentials, keys, job identifiers and media artifacts
remain outside Git. Build, formatting, Clippy and SDK compilation were checked;
fixture-test outcomes are not used as evidence.

This verifies the exercised personal text-video path. Forced crashes at every
transaction boundary, commercial reservation/charge deduplication, reference
inputs and frontend behavior remain unqualified. This does not complete the
first release or authorize performance qualification before the business gates.
