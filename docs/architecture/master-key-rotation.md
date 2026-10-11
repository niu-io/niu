# Master-key rotation implementation boundary

Status: the offline rotation command is implemented; qualification remains
incomplete for nonempty data in every encrypted domain. Follow the
[offline rotation procedure](../reference/offline-key-rotation.md). Replacing
`NIU_VENDOR_ENCRYPTION_KEY` alone is not a rotation procedure. Retain the existing
key with database backups that require it. The sections below retain the earlier
implementation checkpoints and their evidence limits.

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

### Standalone check with an actual retained video result

The inspection command was run against a stopped copy of a database containing
an actual generated video's encrypted result reference. Changing its tag,
truncating its ciphertext, encrypting the reference under another key, and binding
it to another job each produced an unsuccessful exit with a sanitized retained
content diagnostic. Each check preserved the supplied ciphertext and financial
inventory. Restoring the original representation produced a successful exit.

No Gateway listener or retention advisory lock was needed: the standalone command
does not start cleanup. Independent reopening and AES-GCM authentication matched
the original real result reference, Supplier credential fingerprints and ledger
counts. Failure output contained neither the key nor the decrypted result URL.
This adds nonempty media-domain command evidence; it does not establish coverage
of nonempty asset/image/legacy domains, writer fencing, or rotation itself.

## Inspection schema compatibility — 2026-10-11

The read-only command now requires the complete migration set embedded in its
binary, including successful status and matching checksums, before inspecting
any encrypted domain. An older binary must not report complete authentication
while silently omitting a newer schema's encrypted data. Missing, failed, extra
or checksum-mismatched migrations produce a bounded compatibility error. The
command never repairs metadata or applies migrations. Use the matching binary
and resolve schema compatibility through the normal upgrade procedure first.
This validates recorded migration compatibility, not arbitrary out-of-band DDL.

An actual offline copy containing encrypted Supplier credentials and completed
customer charges exercised each incompatible metadata state. Every invocation
left the supplied metadata unchanged. Restoring the original migration records
restored successful inspection. Independent reopening recomputed checksums from
the migration source files, matched the restored migration inventory and confirmed
unchanged credential fingerprints, revisions and financial entries. The original
development database was not modified. This closes an inspection boundary only;
rotation writing, writer coordination and crash-resume remain unimplemented.

## Offline maintenance startup guard

Migration 270 adds a durable operation history with at most one unfinished
rotation. Normal Gateway startup refuses an unfinished operation before Supplier
seeding, listeners or background workers. Completed records cannot be reopened,
rewritten or deleted through ordinary table mutations. The standalone read-only
encryption inspector remains available during maintenance.

This is startup protection, not a fence against already running Gateways. All
writers must still be stopped before the future rotation command begins. No
rotation command is exposed, no ciphertext is rewritten, and completion of an
operation must eventually be owned by the complete destination-key scan described
above. Key-transition binding and progress writes remain to be implemented.

An isolated copy containing actual uncertain admissions exercised two refused
native startups under an unfinished control record. Read-only inspection still
succeeded. Completing that isolated control record restored startup without
performing cryptographic rotation. Independent database reopening verified the
completed history and unchanged Supplier ciphertext/revisions, attempts, customer
reservations/ledger and procurement reservations. The binary included shared
working-tree changes. The original database and deployment key were untouched.
This verifies the guard only; it does not close issue #9 or qualify key rotation.

## Transaction-bound envelope replacement authority

Migration 271 adds append-only authorizations containing an active operation,
transaction identity, a closed table-name inventory and SHA-256 digests of exact
before/after records. They contain no plaintext, ciphertext or keys. A narrow SQL
predicate requires the current transaction, unfinished operation, matching record
digests, non-null envelopes and equality of every non-ciphertext field. Existing
asset credential/content immutability triggers admit only that extra path; their
erasure branches remain intact. Inspected-image updates use the same predicate.
Supplier qualification invalidation skips only an exact authorized envelope
replacement; ordinary credential or other business changes retain invalidation.
No triggers are disabled and no HTTP rotation endpoint is introduced.

This is a trusted maintenance-writer boundary: SQL cannot establish plaintext
equivalence. The future command must authenticate both envelopes, enforce the
intended key transition and exclude concurrent writers before issuing authority.
An authorization record alone is not a receipt that a replacement committed.
The offline command, transition binding, full-domain rewrapping and completion
scan remain unavailable; these schema primitives do not close issue #9.

A fresh native management request saved an isolated disabled account and an
asset-management credential revision. PostgreSQL rejected ordinary replacement,
metadata-changing replacement, a previously committed transaction's authority,
and authority for a completed operation. Exact current-transaction authority
permitted re-encryption under a disposable target key and restoration of the
original envelope. No upstream call or commercial qualification was performed.

Independent reopening verified the restored ciphertext and complete metadata,
three distinct transaction authorization records, completed control operation,
enabled protection triggers and no inference or financial records. Independent
AES-GCM decoding of the stored original and privately retained replacement
artifact confirmed identical plaintext under their respective keys and original
associated data. The binary included shared working-tree changes; the original
runtime database and deployment key were untouched. Nonempty asset-result/image
paths and preservation of a populated Supplier qualification remain unverified.

## Atomic storage replacement primitive

The internal storage API now selects targets from a closed enum covering the ten
retained domains. Each invocation locks an unfinished operation and the exact
identified row, compares the caller's expected ciphertext, inserts the precise
transaction-bound authorization and replaces only the ciphertext column. Both
writes commit together. A missing, erased or changed record and a completed
operation return conflict. Lock and statement timeouts bound database waits.
Neither keys nor plaintext enter the storage API. Its caller still owns complete
cryptographic validation and transition identity; it is not a rotation endpoint
or a substitute for the unfinished offline command.

A private caller exercised the production storage method against a fresh
management-created asset credential. An injected database failure after authority
creation left no extra authorization or changed envelope. A valid replacement
committed; repeating its stale expected envelope returned conflict. Restoring the
original through the same method preserved metadata. A completed maintenance
operation rejected another call. Independent reopening confirmed exact original
bytes and metadata, the expected authorization history, removed fault trigger,
unchanged protection triggers and empty inference/financial ledgers. Independent
AES-GCM decoding matched the original and retained replacement plaintexts.
Compilation, formatting and library lint checks are separate static validation;
no fixture result supports this evidence. Other nonempty domain targets, writer
exclusion, interrupted multi-page rotation and destination-only startup remain
unverified.

## Durable transition identity

Migration 272 stores two nullable 32-byte verification values on each rotation
operation. Existing unbound maintenance history stays intact but cannot authorize
rewrapping. New storage callers must create or resume the exact operation using
independently derived source and target checks. An opaque in-memory handle carries
that binding into every atomic envelope replacement; the operation UUID alone is
no longer sufficient for the storage write API. Completion cannot change either
check or any other operation metadata.

The storage layer treats checks as verification material, not raw secrets. The
trusted command must derive them from the actual supplied keys and operation
identity rather than read and echo database values. Its production cryptographic
input handling remains to be implemented. Beginning/resuming an operation uses a
transaction-scoped advisory claim to serialize creation; it does not exclude a
second complete maintenance process or fence already running Gateway writers.
Those command-level ownership checks and the destination-only completion scan
remain required before exposing rotation to operators.

A fresh management-created credential exercised the bound storage writer through
separate native caller processes. The private caller derived HMAC-SHA-256 checks
from each supplied key, a role-specific domain and the operation UUID. Changing
the source key, target key or operation identity returned conflict; the original
pair resumed. An attempted completion that also changed a check was rejected.
The same run preserved failed-write rollback and stale-envelope rejection. An
independent verifier reopened PostgreSQL, recomputed both checks from privately
retained inputs, and verified the restored ciphertext, unchanged metadata and
expected authorization history. AES-GCM independently authenticated the original
and replacement representations as identical plaintext. No full rotation command,
upstream dispatch or multi-page crash-resume acceptance is claimed.

## Complete offline command and current-input verification

`niu-gateway --rotate-encryption-offline` now scans all ten registered encrypted
domains, including retained expired rows and credentials without active routes.
Legacy credential scanning is paginated instead of loading the whole inventory.
It preflights source-or-target authentication before creating a new operation,
then replaces source envelopes one row per atomic commit. Already-target envelopes
are authenticated and skipped on resume. A complete target-only scan and existing
startup semantic validators must succeed before completion is committed.

The command requires an explicit offline acknowledgement and a matching migrated
schema. It holds an exclusive command-session advisory lock on a connection that
closes on drop, checks that connection during traversal and before completion,
and uses one further connection for inventory/writes. It does not migrate,
bootstrap, start workers/listeners, or contact upstream services. All Gateway
writers must be stopped; the acknowledgement is an operator assertion, not a
fence against already running processes. Keys enter only through the protected
environment and are not printed or stored in the database.

An actual invocation was killed after committing a Supplier envelope while an
asset-credential update waited under an injected database delay. PostgreSQL restart
preserved the committed replacement and rolled back the incomplete update. The
mixed-key database rejected Gateway startup, a competing command was rejected,
and a wrong target key could not resume. Correct resume preserved the first
replacement bytes and changed only the remaining envelope. Target-only inspection,
startup and management reads succeeded; source-only inspection failed. A wrong
source key before first rotation and a missing offline acknowledgement created
no maintenance history. Independent reopening authenticated both final envelopes
against their original plaintext and bindings, checked exact preserved metadata,
and counted exactly two additional authorizations with no unfinished operation.

A separate isolated database retained 101 actual uncertain admissions. After
rotation, target-only startup on two Gateways served one new actual OpenRouter
completion and rejected a competing request at the key spending cap. Independent
raw-response and database checks reconciled usage, one exact customer debit and
procurement cost, while all 101 prior liabilities and reserved budgets remained
unchanged after restart. This used the existing explicit internal verification
credit/rate policy, not commercial qualification or verified merchant funding.

Both binaries included shared working-tree changes; the original native database
and keys were untouched. These runs qualify command interruption/resume and
post-rotation Supplier dispatch plus asset-credential persistence. The subsequent checkpoints below cover retained video and payment configuration.
Nonempty image/asset-result and legacy credential rotation, large-inventory
throughput and populated qualification preservation still need current-input
evidence. Issue #9 remains open.

## Retained video and payment rotation — 2026-10-11

An isolated copy retained the encrypted, unexpired result of an actual generated
video. After offline rotation, destination-only inspection and startup succeeded.
A newly issued scoped key downloaded the result through the Gateway; it was then
revoked. Independent reopening authenticated the new envelope to the exact
original URL using the original company/workspace/attempt/kind binding, verified
unchanged identity and expiry, and matched the downloaded artifact to the original
generation hash. FFmpeg fully decoded it. Restart preserved the result. There was
one new result-retrieval transport record and no additional generation submission,
polling record or customer charge. Rotation did not extend retention or regenerate
the video.

A separate copy retained an actual management-saved EPay configuration and its
unpaid checkout order, with no Supplier records. The command replaced exactly one
configuration envelope. Destination-only inspection, startup and management reads
succeeded across restart; the source key failed inspection. Independent AES-GCM
decoding matched the complete original settings. The configuration revision and
update timestamp, configuration audit count and full pending-order fingerprint
were unchanged. There were no funding receipts or customer balance entries. This
verifies retained configuration encryption and pending-order preservation, not
merchant activation, external payment acceptance or a funded checkout.

Both runs used the current native binary including shared working-tree changes,
on isolated copies only. Their original databases, deployment keys and original
video artifact remained unchanged. No fixture outcome is used as evidence.

## Multi-page credential inventory and canonical audit time

The envelope writer explicitly sets its transaction timezone to UTC and binary
output to hexadecimal before deriving record hashes. JSONB representations of
timestamp-with-timezone columns depend on the session timezone, even when the
stored instant is unchanged. Independent audit tools matching a record against
its authorization digest must also use UTC and hexadecimal `bytea_output`. This
makes the production writer's existing SQLx UTC convention explicit; it does not
change the encrypted payload or stored business timestamp.

A fresh management flow created 101 distinct disabled credential configurations
without model mappings. Moving an authentic envelope to the wrong identity on the
second inventory page caused preflight rejection before any maintenance record or
replacement authority was created; the supplied database fingerprint stayed
unchanged. Restoring that envelope allowed all 101 records to rotate. Destination-
only inspection and restart succeeded. The isolated database deliberately used
non-default escaped binary output; the writer still produced canonical digests.

Independent reopening authenticated every new envelope against its original
plaintext and identity, compared all business metadata, and matched all 101 final
records to their authorization digests using UTC/hexadecimal audit settings. One
operation completed, with no model calls or customer balance entries. This covers
the 100-plus-one credential page boundary and preflight failure on a later page;
it does not establish large-inventory capacity or nonempty coverage of other
encryption domains. The original deployment was not modified.
