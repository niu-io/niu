# Master-key rotation implementation constraints

Status: implementation pending. `--check-encryption` authenticates retained data
without changing it; it does not rotate the deployment key.

The rotation command must cover every retained ciphertext protected by
`NIU_VENDOR_ENCRYPTION_KEY`, including disabled credentials and expired content
that has not been physically erased. Adapter or route availability must not
filter this inventory.

| Stored domain | Existing authenticated binding |
| --- | --- |
| Supplier inference credentials | Vendor UUID |
| Legacy Codex connection credentials | Account UUID |
| Asset-management credential revisions | Domain, vendor UUID, revision and upstream project |
| EPay configuration | Payment configuration domain |
| Media result references | Domain, company, workspace, attempt and result kind |
| Asset listing results | Domain, company, workspace and listing |
| Asset lookup results | Domain, company, workspace and lookup |
| Asset read results | Domain, company, workspace and read |
| Asset update patches | Domain, company, workspace and update |
| Inspected image content | Domain, company, workspace, key and source |

## Database constraints that rotation must preserve

Direct ciphertext updates are not a complete implementation. Asset-management
revisions permit only revoked-secret erasure. Asset listing, lookup, read and
patch records permit erasure only. Inspected image bytes reject updates. Media
result identity, expiry and deletion remain permanent. Rotation must preserve
these restrictions for normal product writes, never resurrect erased content,
and never extend retention or change an authorization binding.

Supplier credential ciphertext updates also trigger route-qualification
invalidation. Re-encrypting identical credentials must not silently deactivate
an offer or create a credential-change audit event. Actual upstream credential
changes must continue to invalidate qualification. Payment revision/audit and
asset credential revision histories likewise describe business changes, not a
change of encryption envelope.

## Required execution contract

Use an explicit offline maintenance operation with all Gateway writers stopped,
a verified database backup and both keys retained outside the database. Fail
closed on a mismatched schema. Authenticate each row with the target key first
for resumability, otherwise authenticate with the source key before re-encryption.
Reject data that neither key authenticates. Reuse the existing exact binding and
verify the new envelope before committing it.

Bound reads and transactions; commit replacement ciphertext and progress
atomically. Concurrent mutation must be rejected or excluded, not overwritten.
A crash must retain either the old or new authenticated envelope. Restarting the
operation with both keys must resume safely; normal Gateway startup must keep
requiring one key that authenticates the complete retained inventory.

No plaintext, ciphertext or keys belong in output, logs, database progress or
command arguments. Before discarding the source key, run complete authentication
with only the target key and then verify actual credential dispatch and retained
result retrieval. Rotation qualification must separately cover interruption,
wrong keys, malformed envelopes, wrong identity binding and preservation of
business revisions, qualification, retention, deletion and financial records.
Existing fixture outcomes are not evidence for any of these requirements.
