# Master-key rotation boundary

Status: design only; master-key rotation is not implemented or qualified.
Changing the deployment key alone is not a supported rotation procedure.
Upstream API-key replacement is a separate operation.

## Retained encryption domains

The current `CredentialCipher` is shared by more than inference credentials.
A complete migration must inventory every retained non-null ciphertext, including
expired content not yet erased. Adapter identity cannot exclude a credential.

| Data | Binding that must remain unchanged |
| --- | --- |
| Vendor inference credentials | Vendor UUID |
| Asset-management credentials | Domain, vendor UUID, credential revision, upstream project |
| Saved payment configuration | Payment-configuration domain |
| Media result references | Media-result domain, tenant scope, job, result kind |
| Asset group read results | Read domain, tenant scope, read identity |
| Asset listings and lookups | Separate domains, tenant scope, operation identity |
| Asset update patches | Update domain, tenant scope, update identity |
| Inspected image sources | Image-source domain, tenant scope, API key, source identity |
| Retained legacy Codex connection credentials | Connection account identity |

This inventory comes from current encryption call sites, not from assumptions
about enabled routes. It does not authorize modifications to Agent Observability
or legacy connection behavior; shared-key changes must account for retained data
without changing those product workflows.

Startup currently validates retained inference and asset-management credentials;
payment configuration has its own startup decoding. That does not establish a
complete scan of retained encrypted content. A healthy startup after changing a
key is therefore insufficient proof that every saved artifact remains readable.

## Storage constraints and migration shape

Several encrypted content and credential tables prohibit updates except explicit
erasure. Vendor credential changes also invalidate qualification. Re-encryption
must not bypass these rules by disabling triggers or pretending the upstream
credential changed. It needs a distinct, bounded maintenance operation whose
only mutable values are the encryption envelope and its key version; tenant,
resource binding, plaintext identity, expiry, revision and business state remain
unchanged. The operation must preserve existing erasure semantics.

Use an explicit maintenance phase before reopening inference traffic. Retain both
keys outside PostgreSQL, encrypt new envelopes with the destination key, and
authenticate existing envelopes with the appropriate available key. Commit each
bounded batch atomically and resume from persisted envelope state after a crash.
Do not persist keys, decrypted content or bearer credentials in progress records.
Mixed-key state must not become ready with only one key while an undecryptable
retained row exists. Exhaustive destination-key verification is required before
removing the source key. Key identifiers alone cannot prove successful decryption.

Existing version-one ciphertexts lack a key identifier. Their transition must
be explicit and authenticated; do not assume that a parseable envelope belongs
to either key. Preserve associated data and use fresh nonces for every replacement.
Concurrent writes and erasure require an explicit maintenance exclusion boundary,
not a best-effort scan of a moving database.

## Required operational evidence

Before a supported operator command is documented, exercise current-input HTTP
creation and retrieval against disposable storage, then independently verify
final artifacts after restart with only the new key. Cover all available data
domains, interrupted batches, concurrent erasure, wrong keys, truncated envelopes
and copied ciphertext under another identity. Dispatch with the retained actual
upstream credential after rotation. Verify missing keys fail closed and diagnostic
output contains no key or content material. Fixture outcomes provide no evidence.

Back up the database and preserve its original key before starting. Retain the
source key until the complete destination-only verification succeeds, including
saved content rather than just model calls. Backup inventory is not a restore
verification. Until the maintenance path and complete-domain checks exist,
rotation remains unverified and must not be advertised as ready.
