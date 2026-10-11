# Master-key rotation implementation plan

Status: planned, not implemented. Changing `NIU_VENDOR_ENCRYPTION_KEY` alone is
not rotation. Existing startup checks authenticate retained data and fail closed;
they do not migrate it. This plan addresses public issue #9 without changing
upstream API keys, Supplier ownership, prices, or historical request bindings.

## Complete inventory

Use the existing cryptographic domain functions, including their exact associated
data and binary formats. A generic vendor-only loop is insufficient.

| Stored domain | Binding that must remain unchanged |
| --- | --- |
| Supplier inference credentials | Vendor identity |
| Retained private Codex credentials | Account identity; preserve existing records without expanding that product surface |
| Asset-management credentials | Vendor, immutable credential revision, upstream project and domain |
| Saved EPay configuration | Existing payment configuration domain |
| Media result references | Organization, workspace, job, result kind and domain |
| Asset listing and lookup results | Organization, workspace, operation identity and distinct domain |
| Asset group read results and update patches | Organization, workspace, operation identity and distinct domain |
| Inspected image source bytes | Existing organization/workspace/key/source binding and binary format |

Include disabled configurations, expired retained content, and revoked but
unerased credential history. Null or physically erased content remains erased.
Never filter the inventory by supported adapter, current route availability or
customer authorization. Future encrypted domains must extend the same inventory
used by startup validation and rotation.

## Offline, resumable operation

The first implementation should be an operator maintenance command, not a public
HTTP endpoint. Stop all Gateway writers and cleanup workers before starting and
keep them stopped until final verification. A database maintenance marker must
prevent normal startup while rotation is incomplete; a database lock must exclude
a second rotation command. This does not claim online rotation support.

Supply old and new keys through protected process configuration, never command
arguments, database rows, logs or artifacts. Require a distinct valid new key and
retain the old key plus a database backup outside the database. Inspect all domains
before starting writes; a wrong key or malformed retained ciphertext must produce
a bounded diagnostic without displaying its contents.

Process bounded keyset batches. Authenticate each source using its original
binding, encrypt under the new key with a fresh nonce, and authenticate the result
before committing. Persist the replacement and its rotation progress atomically.
Crash recovery must distinguish committed rows from unfinished rows without
requiring a plaintext copy. A row already authenticated under the intended new
key is not encrypted again merely because a process restarted. A row decryptable
under neither supplied key stops progress and preserves existing ciphertext.

Rotation progress must bind the operation to the intended key transition without
storing either key. Design and review that identifier format before implementing
resume; an operator supplying a different destination key must not silently begin
a second transition inside an unfinished operation.

## Immutable business records

Several existing asset tables permit only erasure, and inspected image content
rejects updates. Supplier ciphertext changes also invalidate route qualification.
Do not disable these triggers or repurpose normal credential-edit endpoints.
Add narrowly scoped rotation persistence that changes encryption representation
only, with an immutable audit of the operation and unchanged business fields.

Vendor and model revisions, asset credential revisions, qualification, ownership,
expiry, erasure markers and request bindings must remain unchanged. Payment
configuration revisions and pending-order verification settings must also remain
unchanged. The database cannot prove plaintext equivalence; the trusted command
must authenticate both values, while SQL enforces identity/metadata preservation
and operation ownership. Document this trust boundary explicitly.

## Finalization and acceptance

Completion requires a full inventory scan with only the new key, followed by
startup and actual authorized use. Clear the maintenance marker only after that
scan succeeds. Keep the old key and backup until recovery has been independently
verified; rotation must never erase application data to make startup succeed.

Use an isolated database containing API-created credentials, saved payment
configuration and actual retained media/content artifacts. Exercise interruption
between batches, repeated resume, a wrong destination key, truncated ciphertext,
and cross-identity replacement. Verify final records independently: original
business identities/revisions, authenticated content, unchanged ledgers and no
secret output. Perform actual inference with the rotated credential and retrieve
retained content after restarting with only the new key. Empty-domain checks and
fixture outcomes cannot establish these nonempty acceptance cases.

Deliver storage/audit and trigger changes, the complete domain inventory and
command, then current-input recovery verification and operator documentation as
reviewable increments. Keep rotation unavailable until the full path is wired;
no partial command may report success after visiting only Supplier credentials.
