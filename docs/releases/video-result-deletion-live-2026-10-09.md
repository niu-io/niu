# Live video result deletion

Date: 2026-10-09. This run used the second actual personal OpenRouter video
created for the [model-edit recovery checkpoint](video-mapping-recovery-2026-10-09.md).
It did not submit another generation or delete the first lifecycle-check video.

Before deletion, Niu downloaded the saved result successfully. Its byte length
and SHA-256 matched the original independently decoded artifact. Two authorized
result-deletion requests then returned `deleted: true`; availability reported
both video and last frame unavailable, and video download returned HTTP 404.

An explicit refresh queried the real upstream job after deletion. The job
remained succeeded and its billing response was unchanged. The refreshed result
reference did not restore availability or download access. After gateway restart,
a replacement workspace key observed the same saved status, billing response,
unavailable results and download rejection.

Independent PostgreSQL inspection confirmed two retained deletion markers and
zero non-null encrypted result references for this job. Both temporary access
keys were revoked. Request identifiers, credentials and verification artifacts
remain outside Git.

This demonstrates durable Niu result deletion across an actual upstream refresh
and restart for the exercised owner-funded job. It does not establish deletion
of the upstream file, cancellation, a refund or commercial settlement. It does
not qualify an in-flight download/deletion race, automatic expiry, all media
formats or frontend behavior. No fixture-test outcome is used as evidence.
## Current-state follow-up — 2026-10-10

Rechecking a previously saved real video on backend `5a2449d` found that its
result reference had expired, had a deletion timestamp and no longer contained
ciphertext. A current provider refresh returned successfully and retained the
job's succeeded status, but scoped result retrieval remained HTTP 404. The
earlier successful-download script could therefore no longer qualify a fresh
download from this artifact; its old output hash was not reused as current
evidence.

A dedicated current-input HTTP run confirmed the same 404 after refresh,
foreign-workspace viewer rejection with 403, and rejection with 401 after the
selected key was revoked. Independent before/after database counts confirmed no
new video submission, customer balance entry or Supplier earning. Temporary
operators and keys were revoked. No retention timestamp or deleted result was
reset to make the download succeed.

Separately, a fresh read of an existing upstream video returned completed status
and `usage.cost`, but no duration or reported billable quantity. That upstream
expense is not a customer charge and does not establish seconds-based customer
settlement. This checkpoint verifies current result unavailability and financial
isolation, not a new video generation, decoded result or customer media debit.

## Bounded deletion checkpoint — 2026-10-12

Implementation `feae5a7` uses the shared bounded recording transaction for result
deletion. Both retained kinds commit together. Existing deletion markers, expiry
and nonresurrection rules are unchanged. An unavailable write is not a completed
deletion: callers must retry and confirm state after resolving contention.

An actual HTTP run copied a stopped database containing a genuinely generated
personal OpenRouter video. With the result row locked, the preceding immutable
binary's deletion was still pending after 1.6 seconds. The updated immutable
binary returned 503 after approximately 258 ms while the lock remained held.
Complete record fingerprints and result availability remained unchanged after
this failure. After release, deletion succeeded; repeated deletion, actual
upstream refresh and Gateway restart did not restore the encrypted reference or
download access. The succeeded job and owner-funded billing response were
unchanged, including after restart.

Independent PostgreSQL reopening checked erased references, durable deletion
markers, the retained completed attempt, restart fingerprints and temporary-key
revocation. Server logs identified the deletion statement's lock timeout. No new
generation, customer charge, funding or payment was introduced. This does not
qualify natural expiry, customer-funded media settlement or deletion throughput.
The bounds apply to individual transactional statements, not preflight reads,
pool admission or the whole HTTP request. No fixture outcome is evidence.

A fresh native backup was restored and checked before updating the existing
installation. Exact binary digests were checked; original configuration,
encrypted identity and durable counts remained intact on schema 278. Readiness
and persisted routing agreement were confirmed.
