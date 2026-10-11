# Master-key rotation implementation boundary

Status: implementation planning, not an available rotation procedure. Replacing
`NIU_VENDOR_ENCRYPTION_KEY` alone is not supported. Retain the existing key and
back it up separately from the database. This inventory follows the current
`apps/gateway/src/vendors/crypto.rs` encryption domains and storage migrations.

## Encrypted domains

| Stored domain | Binding that rotation must preserve |
| --- | --- |
| Supplier inference credential | Vendor identity |
| Asset-management credential revision | Vendor, revision and upstream project |
| Payment gateway configuration | Existing payment-configuration domain |
| Media result reference | Tenant scope, job and result kind |
| Asset listing and lookup result | Tenant scope and operation identity |
| Asset group read result and update patch | Tenant scope and operation identity |
| Inspected image source | Exact storage-provided associated data and binary bytes |
| Retained private OAuth connection | Existing account binding, if such records remain |

The last domain is inventory only; rotation must not expand or reactivate retired
agent features. Nullable erased ciphertext must stay erased. Unknown adapters
must not cause credential rows to be skipped. Domain-specific payload validation
and associated data must remain identical across encryption generations.

## Storage constraints to resolve before writes

The asset-management credential trigger allows revoked-secret erasure, but not
arbitrary ciphertext replacement. Asset result and patch tables similarly permit
erasure only. A migration must separate immutable business identity from mutable
encryption representation without allowing modification of logical content,
retention timestamps, approvals or revocation state. Disabling triggers globally
is not an acceptable rotation mechanism.

Updating `vendors.credential_ciphertext` currently invalidates Supplier route
qualification through `supplier_configuration_requires_new_review`. Rewrapping
the same secret must not masquerade as an upstream credential change. The design
must preserve qualification evidence while retaining invalidation for a genuine
credential, adapter or endpoint replacement.

## Required execution model

Use a dedicated maintenance operation with exclusive coordination against all
Gateway writers. Define that coordination explicitly before allowing online
rotation; a process-local mutex cannot fence another Gateway. Back up first.
Accept old and new keys through deployment secrets, never CLI arguments,
PostgreSQL records or logs. Validate both configuration inputs before writes.

Process bounded pages with durable progress. For each row, authenticate the old
ciphertext using its exact domain binding, encrypt under the new key, authenticate
the result and commit the replacement atomically with progress. A crash must leave
either representation recoverable. Resume must distinguish completed rows from
old rows and must fail on corruption instead of treating decryption failure as a
reason to skip. Concurrent erasure must never resurrect secret content.

Before declaring completion, independently scan every retained encrypted domain
using only the new key. Until that scan succeeds, do not serve a mixed-key database
as healthy with only the new key. Keep the old key until completion and backup
retention requirements are satisfied. Existing startup credential scans alone do
not prove that retained media or asset content has been migrated.

## Verification still required

Use isolated native databases and disposable encryption keys. Include actual
management writes and an actual upstream dispatch after restart with only the
new key. Verify persisted content independently. Interrupt between committed
pages and resume; inspect erasure, qualification and revision invariants. Exercise
wrong keys, truncated ciphertext and cross-identity substitution without logging
secret material. Fixture results are not acceptance evidence. No rotation runtime,
crash-resume behavior or complete encrypted-domain coverage is qualified yet.

## Payment startup prerequisite implemented

Startup now authenticates and decodes saved payment configuration before
readiness, including disabled configuration in an installation with no Supplier
records. A fresh native run saved merchant configuration through the management
API, then attempted startup with a missing and a different master key. Both
exited unsuccessfully with sanitized diagnostics, without modifying ciphertext
or its revision. Restoring the correct key restored configuration reads.
Independent AES-GCM decryption of the stored bytes verified the saved merchant
secret; the three management writes had exactly three audit events and no
customer balance entries. This is startup failure containment, not rotation or
complete validation of all retained encrypted content.

A follow-up isolated run saved another configuration through the real management
API, stopped the Gateway, and deliberately damaged only that isolated database's
saved representation. Truncation and a changed authentication-tag byte each
prevented startup. A separately authenticated encrypted JSON object missing the
required configuration fields reached decoding and was also rejected. Each
failed startup left the supplied ciphertext hash and revision unchanged; error
messages distinguished decryption from invalid configuration without including
merchant keys or the decrypted object. Restoring the original saved bytes
restored normal reads, and independent AES-GCM decoding matched the saved secret.
The original three configuration audit events remained, with no customer balance
entries. This is fault injection against actual persisted management input, not
an upstream payment or master-key migration acceptance run.


## Envelope transition and completion audit

Current version-one ciphertexts do not carry a key identifier. Their transition
must authenticate the existing envelope rather than infer key ownership from
parseable bytes. Replacement uses fresh nonces and preserves the exact associated
data. A future key identifier is routing metadata, not proof of decryption.

The completion inventory includes expired but not yet erased ciphertext. Checking
only enabled mappings or active operations can miss retained secrets and content.
Bounded batches must preserve erasure while maintaining the exclusive writer
coordination above. A complete destination-only scan must cover binary inspected
image sources as well as UTF-8 credentials and result records. Startup now also enumerates retained media, asset-result/patch and inspected-image
content, as described below. This authenticates current retained data; it does not
coordinate writers or establish a rotation completion transaction.

## Retained-content startup authentication

Startup now enumerates six private-content domains before opening the listener or
starting retention workers: media result references, asset listing/lookup results,
asset group read results/update patches, and inspected image source bytes. Each
keyset page contains at most eight objects and uses the existing domain-specific
associated data. The image path authenticates binary bytes without UTF-8 decoding.
Expired but not yet erased content is included; null/deleted content is not
resurrected. The scan emits no IDs, payloads, ciphertext or key material on failure.
It adds startup work proportional to retained content, using the existing database
pool and no permanent extra connection.

An offline copy of a database containing an actual generated video's retained
result reproduced the prior gap: its modified authentication tag did not prevent
readiness. With the new startup check, tag corruption, truncation, encryption
under a different key, and binding to another job all stopped startup before
readiness. Each attempt preserved its supplied ciphertext and the existing
attempt/media/financial inventory. Restoring the original result allowed startup.
The observation held the existing retention advisory lock so expired content
remained available for independent inspection; it did not extend retention or
alter the original development database. Independent reopening and AES-GCM
authentication verified the restored real result, encrypted vendor identities,
sanitized failure logs and unchanged accounting records.

Nonempty asset-result and inspected-image startup cases, multi-page coverage and
large-retention startup latency remain unverified. These checks authenticate
retained bytes at startup; they do not provide an atomic audit across concurrent
writers, continuous corruption detection, or a rotation writer fence. The rotation
command, rewrapping, trigger changes and crash-resume procedure remain unimplemented.
Issue #9 therefore remains open. No fixture outcome supports these conclusions.

## Cross-identity credential startup check — 2026-10-11

A fresh isolated native run created two disabled configurations through the
administration API using the saved personal upstream credential. With the Gateway
stopped, one configuration's authenticated ciphertext was copied to the other
configuration in that isolated database. Startup exited unsuccessfully, without
changing either stored representation or revision. Its captured diagnostic output
contained neither the upstream credential nor the master key. Restoring both
original ciphertexts restored readiness and association reads.

A separate verifier reopened the persisted database and authenticated both records
with an independent AES-GCM implementation. Each decoded to the saved input only
under its original vendor identity; substituting the other identity failed
authentication even though both inputs contained the same upstream key. Original
ciphertext fingerprints and revisions were preserved and no inference attempt was
created. The original development database and encryption identity were untouched.
This establishes current identity binding and startup failure containment. It does
not implement rotation, prove interrupted re-encryption recovery, or establish
post-rotation upstream dispatch.

## Initial offline command and completion boundary

Implement the first rotation path as an operator maintenance command, not a
public HTTP endpoint. All Gateways and cleanup workers must be stopped; this
initial scope does not promise online rotation. Persist a maintenance marker that
normal startup checks, and exclude competing rotation commands with a database
lock. Preserve the existing inventory and all acceptance requirements above.

The resumable operation must bind its progress to the intended key transition
without storing either key. Review that identifier format before implementing
resume. Supplying a different destination key must not silently start another
transition inside an unfinished operation. A row already authenticated under the
intended new key must not be re-encrypted merely because the process restarted.
A row decryptable under neither supplied key stops progress without erasure.

Preflight must inspect all retained domains before writes. A final complete scan
using only the new key is required before clearing the maintenance marker.
Payment configuration revisions and pending-order verification settings must
remain unchanged, alongside the Supplier and content bindings documented above.
The database cannot prove plaintext equivalence: the trusted command authenticates
both representations; SQL must enforce unchanged identity, business metadata and
rotation ownership. This is an explicit trust boundary, not an authorization to
disable existing immutability triggers.

Deliver persistence/audit and trigger changes, complete domain enumeration and
command wiring, then actual crash-resume and post-rotation use verification as
reviewable increments. Keep the command unavailable until every retained domain
is covered; a Supplier-only loop cannot report completed rotation. No command or
rotation migration has been implemented by this planning update.

## Available read-only encryption inspection

`niu-gateway --check-encryption` authenticates retained encrypted data using
`NIU_DATABASE_URL` and `NIU_VENDOR_ENCRYPTION_KEY` from the protected environment.
Do not put either value in command arguments. It reuses startup domain validators,
including retained legacy credential records, without enabling their features.
A successful check exits zero; a missing/incompatible key, malformed retained data,
or unavailable/incompatible schema exits unsuccessfully with bounded diagnostics.

The command opens at most one database connection, sets transactions read-only,
and does not run migrations, configuration bootstrap, listeners, retention,
payment recovery or upstream calls. It does not require an admin token or a server
configuration file. Do not interpret its success as proof of upstream credential
validity, commercial qualification, a consistent audit across concurrent writers,
or a completed key rotation. Stop writers for a definitive offline inventory;
the command itself does not fence other processes.

Current-input verification ran against the existing native encrypted database
while its Gateway remained available. The matching key succeeded; a fresh wrong
key and an absent key failed. A deliberately nonexistent server configuration did
not affect the standalone check. Separately reread table fingerprints and migration
history matched the pre-command artifacts, and private configuration hashes stayed
unchanged. Captured command output did not contain either supplied key. This does
not qualify nonempty contents in every domain or implement re-encryption/resume.
