# Ordinary asset-group metadata update

## Transport checkpoint — 2026-10-08

The media library implements a fixed UpdateAssetGroup transport against the
[official Ark contract](https://docs.volcengine.com/docs/ark/update-asset-group-api?lang=zh).
It accepts only optional name and description changes and requires at least one
field. Name validation uses Unicode character limits, rejects blank names and
controls, and preserves supplied text. Description validation bounds characters
and rejects unsupported controls. Omitted fields remain omitted; an explicit
empty description is sent as empty, without claiming live clearing behavior.

The request retains its original private group identity and upstream project.
Only the fixed action can be signed; no group-type, endpoint, asset-ingestion or
real-person field is accepted. These validated types do not establish provenance,
ordinary-group status or authorization. Callers must obtain the saved original
ordinary group and recheck current account credentials and a separately reviewed
UpdateAssetGroup grant before dispatch.

Transport performs one bounded signed POST with public DNS validation/pinning,
no proxy, redirects or retries, a maximum 1 MiB response and a maximum 30-second
deadline including DNS and body reads. The acknowledgement must match the exact
original group and operation metadata. Private request fields, upstream errors
and acknowledgement identities have no diagnostic formatting or public result
projection. Acknowledgement is not read-back verification. Any unacknowledged
dispatch may have applied; it must remain uncertain until reconciled, rather than
being silently retried or presented as a confirmed mutation failure.

Fresh verification: the complete media suite passed 79 tests with one live TLS
test intentionally ignored. Five new tests cover patch presence/omission,
explicit empty description, Unicode bounds and controls, acknowledgement
identity/metadata/errors/duplicate fields, signature binding across metadata,
project and action, and invalid transport bounds before network access.
Changed Rust formatting, whitespace and the five-file public-boundary check
passed. All-target media Clippy passed with warnings denied.

No live Supplier request was made. Operation-specific qualification, durable
mutation intent/claims and outcomes, uncertain-result reconciliation, gateway
and SDK routes, customer controls, package recovery and live qualification remain
unimplemented. This internal transport does not complete V08 or any full release
gate. The migration-0178 package checkpoint predates this code.

## Operation-specific qualification — 2026-10-08

Migration 0183 permits a distinct UpdateAssetGroup qualification without changing
existing grants. Storage, the platform-administrator API, OpenAPI and SDK accept
the new operation. Omission remains CreateAssetGroup. The existing nonzero review
references, expiry bounds, original workspace/account/credential revisions,
account lock and independent revocation apply. A grant identifies reviewed
evidence; hashes alone do not establish rights. Qualification neither releases
credentials nor activates mutation dispatch and returns dispatch_available: false.

One isolated storage PostgreSQL test passed through migration 0183, verifying
that simultaneous creation, group-read, listing and lookup grants do not imply
metadata writes, wrong workspace/account/credential revisions are denied, and
revoking update permission preserves other grants. All 163 SDK tests passed after
a fresh build, including explicit UpdateAssetGroup operation and cancellation
forwarding. OpenAPI parsing, whitespace and the eight-file public-boundary check
passed. One isolated gateway PostgreSQL test passed through migration 0183,
including ordinary-owner/inference-key/invalid-token denial, explicit operation,
dispatch_available: false, reconstruction and independent revocation. Final
media/storage/gateway all-target Clippy passed with warnings denied. Changed
Rust formatting and the expanded eleven-file public-boundary check passed.

Durable mutation intents/claims, reconciliation, gateway dispatch, rendered
controls, package recovery and live qualification remain open. No complete
release gate is passed by this authorization extension.

## Durable preparation and one-shot claim — 2026-10-08

Migration 0184 separates immutable update identity, original successful ordinary
group and exact grant/digest from erasable 24-hour patch ciphertext. Preparation
requires current exact account/credential revisions and an UpdateAssetGroup grant.
Repeated identity plus original group and patch digest preserves the first saved
patch; a different digest conflicts. It does not transfer the original grant.

Claim locks the original account and saved patch, invokes bounded local
authenticated decryption, checks the exact plaintext SHA-256 and restores only
the original group/project and allowed metadata fields. The snapshot parser
rejects duplicate/unknown fields, explicit null substitution, group-type
injection and changed scope. An immutable claim and per-group hold commit before
original credentials are returned. Repeated claims never replay. Another edit of
the group stays blocked until explicit result reconciliation can release the hold.
No network I/O belongs inside the claim transaction.

Patch erasure and bounded background expiry cleanup preserve immutable intent,
claim and hold. Reusing the prepared identity does not resurrect erased content.
There is intentionally no hold-release API in this increment: completion and
reconciliation must be implemented before mutation dispatch can be enabled.

One isolated storage PostgreSQL regression passed through migration 0184,
covering absent grant and wrong workspace, malformed preparation bounds,
idempotent identity/digest, changed-patch conflict, original-grant revocation and
non-transfer to a later grant, erasure before claim, explicit expiry/purge,
decoder and digest failures, competing claims, original credential/request
binding, immutable audit/content and blocking another edit while unresolved.
The existing zero-billing assertion also passed. The fixture uses synthetic
ciphertext and a synthetic decoder, not gateway AES-GCM or live dispatch.
All 42 media unit tests passed, including exact private-snapshot restoration
and tamper rejection. The storage regression passed again after replacing the
complex query tuple with a named row type. Changed Rust formatting, whitespace
and the eight-file public-boundary check passed. Final media/storage/gateway
all-target Clippy passed with warnings denied. Its initial type-complexity finding
was resolved with the named row type before the passing regression and lint runs.

Gateway encryption/preparation/dispatch, durable completion, read-back
reconciliation, safe hold release, customer controls, package recovery and live
qualification remain open. No full release gate is passed.

## Durable completion and safe audit history — 2026-10-08

Migration 0185 records immutable first completion for claimed metadata updates.
An upstream acknowledgement is recorded as `acknowledged`, not verified success.
A missing acknowledgement is `uncertain`, with a bounded diagnostic reason.
Neither state releases the per-group hold or permits replay. Negative durations,
unrecognized reasons, unknown or unclaimed updates and foreign workspaces are
rejected. Completion remains possible after permission revocation or patch
erasure so accepted work can finish its audit.

Scoped, cursor-paginated history distinguishes prepared, unresolved, acknowledged
and uncertain work. It reports patch retention and whether reconciliation is
required, without patch content, upstream identities, credentials or billing
values. Internal references remain backend routing/audit fields; this increment
does not add a rendered raw-data panel.

The isolated storage PostgreSQL regression
`asset_listings_claim_original_group_once_and_audit_without_billing` passed
through migration 0185 (one test, zero failures). It covers competing completion,
first-result preservation, independent group holds, revocation and erasure,
immutable outcome rows, reconstructed history, scope/cursor/limit checks and
zero billing. The fixture uses synthetic encrypted bytes and a synthetic decoder;
it does not establish gateway encryption or live upstream behavior. Fresh
media/storage/gateway all-target Clippy passed with warnings denied.

Gateway encryption/preparation/dispatch, read-back reconciliation, safe hold
release, customer controls, packaged recovery and live qualification remain open.
The packaged checkpoint through migration 0178 does not qualify migrations
0179–0185. No complete release gate is passed by these storage tests.

## Exact read-back content validation — 2026-10-08

The metadata update request can now validate a bounded GetAssetGroup response
against its original group/project and requested fields. It reuses the strict
ordinary-group response parser, including fixed action/version/service/region,
ordinary group type, metadata bounds and valid timestamps. Omitted patch fields
are unconstrained; an explicit empty description requires an explicit empty
response value, rather than treating missing or null as confirmation. Duplicate
fields, wrong scope/type/action, changed requested values and oversized or
malformed responses are rejected.

All 43 media unit tests passed. The added read-back test covers name-only,
description-only and combined patches, wrong identity/project/type/action,
invalid timestamps, explicit clearing, missing/null descriptions, duplicate
fields and the response bound. This is content validation only: it does not
establish fresh read provenance, current authorization, durable reconciliation
or permission to release a hold. Uncertain writes remain unresolved even if a
matching response is supplied. No live upstream call was made.

Media all-target Clippy with warnings denied, changed Rust formatting, whitespace
and the three-file public-boundary check also passed for this increment.

## Update-bound fresh read admission — 2026-10-08

Migration 0186 adds an immutable link from a reconciliation read claim to its
acknowledged update. Admission locks the original Supplier account, checks the
update still holds its original group, and requires a distinct current
GetAssetGroup grant and original account/credential revisions. The read claim
and update link commit together before credentials leave storage. A read
identity cannot replay or acquire a second binding. Uncertain, unclaimed and
foreign-workspace updates are ineligible. Revoked update permission does not
prevent an independently authorized read of already accepted work.

This is fresh read admission only. Matching response validation, encrypted
result persistence and durable reconciliation still need to be joined before
any hold can be released. No hold-release or gateway mutation endpoint is
enabled, and no live call was made.

Three isolated PostgreSQL regressions passed through migration 0186: asset
handoff, original-group read audit, and listing/update/lookup audit. New checks
cover revoked read permission, admission under a new read grant, wrong scope,
unknown/prepared/uncertain updates, repeated read identity, exact original-group
and update binding, claim time after acknowledgement, immutable binding rows
and preserved holds. Existing zero-charge assertions passed. Changed Rust
formatting, whitespace and the four-file public-boundary check passed. An
initial fixture incorrectly assumed there was no earlier read grant; it now
revokes that grant explicitly before testing denial. The packaged checkpoint
through migration 0178 does not qualify this migration.

Final storage/gateway all-target Clippy passed with warnings denied.

## Durable acknowledged-write reconciliation — 2026-10-08

Migration 0187 retains immutable reconciliation identity and its exact bound
read. Storage reconciliation locks the original account, update identity, read
claim and retained result/patch. It requires an acknowledged outcome, the
original per-group hold, a successful update-bound read claimed after the
acknowledgement, current original account/credential revisions and current
read permission. Missing, erased or expired content is ineligible.

The caller must authenticate the distinct patch and read encryption domains
with bounded local decryption. Storage independently checks the patch digest,
restores its original group/project and compares all requested metadata. A
match commits immutable reconciliation and hold removal together. Mismatch or
decoder failure preserves the hold. Reconciliation never replays a mutation;
an uncertain outcome is ineligible. This increment does not enable gateway
mutation dispatch or prove encrypted gateway read/patch integration.

Three isolated storage PostgreSQL regressions passed through migration 0187.
New assertions reject erased patches, uncertain writes, unfinished reads, wrong
workspace and another update's read; decoder/digest/metadata failures preserve
the hold. A successful match records its exact read, releases only its own hold,
rejects duplicate reconciliation and mutation replay, and permits a new
separately prepared edit. Reconciliation rows resist deletion. Existing
zero-charge checks pass. Synthetic fixture ciphertext/decoders do not prove
authenticated gateway encryption. All 43 media unit tests passed after sharing
the metadata comparator. Changed Rust formatting, whitespace and the six-file
public-boundary check passed. Gateway integration, packaged recovery beyond
0178, rendered controls and live qualification remain open.

Final media/storage/gateway all-target Clippy passed with warnings denied.

## Reconciliation revocation and recovered audit status — 2026-10-08

Audit history now reports `reconciled` only when an immutable reconciliation
exists, retaining the same nine-field safe projection. Acknowledgement without
read-back remains `acknowledged`. Three isolated PostgreSQL regressions passed
through migration 0187 after adding checks that revoked read permission denies
reconciliation before decoding and a new grant cannot revive a read claimed
under the revoked grant. A newly claimed, successful read under the new grant
can reconcile. Reconstructing the Store preserves `reconciled` status and
`reconciliation_required: false`. Existing zero-charge checks passed.

These are storage acceptance results using synthetic encrypted data, not live
upstream or gateway encryption qualification. Full release gates remain open.

Storage/gateway all-target Clippy with warnings denied, changed Rust formatting,
whitespace and the three-file public-boundary check passed.

## Typed retained-read prerequisite — 2026-10-08

Gateway retrieval now restores retained group-read metadata using a bounded
typed snapshot parser rather than returning arbitrary decrypted JSON. The
parser requires the exact read identity, rejects unknown/duplicate fields,
validates ordinary metadata limits and timestamps, and preserves the difference
between an empty description and no description. The response is rebuilt from
allowed fields. This parser is available to the pending encrypted reconciliation
integration; no mutation dispatch endpoint is activated by this change.

The focused gateway snapshot test passed, covering exact read identity, metadata
bounds/control characters, timestamps, unknown fields, duplicate names, size
limits and empty/null description semantics. The isolated PostgreSQL gateway
regression `asset_group_reads_dispatch_original_account_and_finish_after_disconnect`
passed through migration 0187, preserving encrypted retrieval/reconstruction,
scoped access, deletion and disconnect behavior with the typed parser. These
checks do not establish patch encryption or end-to-end mutation reconciliation.

Final media/gateway all-target Clippy with warnings denied, changed Rust
formatting, whitespace and the three-file public-boundary check passed.

## Gateway encrypted preparation — 2026-10-08

The platform-admin preparation endpoint derives the original upstream group and
project from the successful saved group, rather than accepting upstream identity
from a client. It requires current distinct update qualification through the
existing storage preparation gate. Patch encryption uses AES-GCM with the
separate `niu.asset-group-update-patch.v1` domain, organization, workspace and
update reference. Retained plaintext and ciphertext are bounded.

The endpoint preserves immutable identity/digest idempotency, rejects changed
patches and unknown upstream-identity fields, and distinguishes omitted fields
from explicit string values. Explicit null metadata is rejected. Its response
reports preparation only and `dispatch_available: false`; no upstream mutation
is dispatched. The API and video reference document this limited contract.
SDK support, mutation dispatch, encrypted reconciliation integration, rendered
controls, packaged recovery and live qualification remain open.

The isolated gateway PostgreSQL regression passed through migration 0187 after
adding preparation acceptance: invalid authentication, missing qualification,
creation and identical replay, changed-patch conflict, unknown upstream field
and explicit-null rejection, absence of plaintext in retained ciphertext,
recovery using a reconstructed cipher, wrong update/workspace/organization
authentication failure, cross-domain read/lookup/listing rejection, tampering,
and storage claim restoration into the exact signed original request. Existing
encrypted-read recovery/disconnect checks also passed. No live mutation was
sent. An initial malformed-request assertion used a JSON-only test helper on
Axum's plain rejection body; the corrected assertion checks the raw HTTP status.
OpenAPI parsing, changed Rust formatting, whitespace and the nine-file
public-boundary check passed.

Final storage/gateway all-target Clippy passed with warnings denied.

## Preparation SDK acceptance — 2026-10-08

The public JavaScript SDK exports typed preparation input/result and
`NiuAdminClient.prepareOrdinaryAssetGroupUpdate`. It forwards cancellation,
preserves omission versus explicit description clearing, validates metadata
limits and UUID references before transport, and sends only the allowed fields.
The result type keeps `dispatch_available: false`; no mutation execution is
implied. Conflicts propagate without automatic retry.

A fresh TypeScript build and all 165 SDK tests passed. Two added tests cover
request identity/shape, endpoint/method, unknown-field omission, cancellation,
empty description, permitted whitespace, conflict propagation and one request
per call; invalid/empty/null/oversized/control-character metadata and malformed
references are rejected without network I/O. SDK documentation, whitespace and
the five-file public-boundary check passed. The earlier preparation SDK gap is
closed; dispatch, encrypted read-back reconciliation integration, rendered
controls, packaging beyond 0178 and live qualification remain open.

## One-shot gateway dispatch — 2026-10-08

The explicit platform-admin dispatch endpoint binds the path account and scoped
saved update before claiming. Claim decrypts the retained patch with exact
workspace/update AAD and validates the stored digest and original request.
Original management credentials sign a single fixed mutation. Four slots are
admitted without queueing, with a 30-second transport and 35-second outer
deadline. A tracked detached worker records acknowledgement or uncertainty
even when its caller disconnects. Process loss leaves a non-replayable unresolved
claim. No outcome releases the group hold or posts an inference charge.

The endpoint returns only the saved update reference, safe status and required
reconciliation. Errors are bounded categories in durable storage, not raw
upstream payloads. Full encrypted read-back integration, capacity/disconnect
acceptance, SDK dispatch, rendered controls, packaged recovery and live
qualification still require evidence.

The isolated gateway PostgreSQL regression passed through migration 0187 with
controlled dispatch acceptance: wrong account is denied before transport;
actual authenticated patch restoration signs the exact original request;
acknowledgement persists; transport failure persists as uncertainty; neither
acknowledged nor uncertain updates can replay. Existing encrypted preparation
and group-read recovery/disconnect checks also pass. The latter disconnect
checks concern reads, not metadata writes. No live upstream mutation was sent.
OpenAPI parsing, whitespace and the eight-file public-boundary check passed.

Final storage/gateway all-target Clippy with warnings denied and changed Rust
formatting passed. The full release remains incomplete.

## Dispatch capacity and disconnect acceptance — 2026-10-08

The controlled gateway PostgreSQL fixture now prepares five independent
ordinary-group updates and holds four transport workers open. One parent caller
is aborted after its transport starts. The fifth update must receive a capacity
rejection without a durable claim; aborting a caller must not release its
worker's execution slot. Releasing the four workers must preserve all first
outcomes, including the disconnected caller's. The fixture waits for tracked
workers to finish before admitting the previously rejected fifth identity.
This exercises local controlled transport, not live upstream writes or process
restart.

The isolated gateway PostgreSQL regression passed through migration 0187 with
this capacity/disconnect sequence, including a 503 saturation response, no
claim for the rejected identity, all four persisted acknowledgements and
subsequent admission of that identity. The disconnected worker remains tracked
until completion. This closes the local write-capacity/disconnect subset;
process restart/restore and live upstream acceptance remain unqualified.

Explicit SDK dispatch is now available through
`dispatchOrdinaryAssetGroupUpdate`. A fresh build and all 166 SDK tests passed,
including scope/identity validation before network I/O, cancellation forwarding,
acknowledgement/uncertainty preservation and conflict propagation without retry.
SDK documentation states the incomplete read-back integration and live gates.

Gateway all-target Clippy with warnings denied, changed Rust formatting,
whitespace and the six-file public-boundary check passed.

## Encrypted gateway reconciliation and SDK — 2026-10-08

The explicit reconciliation endpoint derives the saved original group from the
scoped update. It uses the existing bounded, tracked read worker with a fresh
update-bound claim and separate current read permission. The worker encrypts and
persists the read, authenticates patch and read using their independent domains,
restores typed metadata and invokes atomic storage reconciliation. A mismatch
preserves the hold; uncertain and already reconciled writes cannot send another
read. This introduces no mutation replay or customer charge.

The controlled gateway PostgreSQL regression passed through migration 0187 with
new assertions for uncertain-update denial before transport, mismatched metadata
keeping the hold, exact original signed read, matching encrypted read-back,
no plaintext in retained ciphertext, reconstructed read decryption, cross-domain
rejection, atomic hold release and recovered reconciled audit status. Existing
preparation, dispatch, saturation, disconnect and group-read recovery checks also
passed. These are local fixtures, not live upstream or packaged restart proof.

The SDK now exposes `reconcileOrdinaryAssetGroupUpdate` with fresh read identity,
scoped references, cancellation forwarding and typed reconciled result. A fresh
build and all 167 SDK tests passed, including malformed references before I/O
and mismatch propagation without automatic retry. Full rendered controls, audit
retrieval/erasure API coverage, packaged recovery beyond 0178 and live
qualification remain open.

The gateway PostgreSQL regression passed again after explicitly discarding the
internal read response in the reconciliation wrapper. Final storage/gateway
all-target Clippy with warnings denied, changed Rust formatting, OpenAPI
parsing, whitespace and the twelve-file public-boundary check passed.

## Scoped audit and patch erasure API — 2026-10-08

Platform administrators can now retrieve bounded cursor-paginated update audit
and erase a retained patch through scoped endpoints. The gateway checks the
exact path account/workspace binding before erasure. Repeated erasure is
idempotent; audit, claims, holds and reconciliation remain. Audit returns only
the existing nine-field projection, never patch metadata, upstream identity,
credentials or commercial amounts. Global API no-store handling applies.

The isolated gateway PostgreSQL workflow passed through migration 0187, covering
chronological pagination, scope isolation, limit bounds, invalid authentication,
ordinary owner/admin/viewer denial, repeated patch erasure, absent ciphertext,
reconciled audit survival, safe projection and zero customer balance entries,
reservations and charges for the complete management fixture. Existing encrypted
preparation, dispatch, saturation/disconnect and reconciliation assertions pass.
A fresh SDK build and all 168 tests passed, including scoped cursor queries,
erasure, cancellation forwarding and local reference/limit rejection.
OpenAPI and SDK references document both endpoints. This closes the earlier
audit retrieval/erasure API gap; rendered lifecycle controls, packaged process
recovery beyond 0178 and live upstream qualification remain open.

Gateway all-target Clippy with warnings denied, changed Rust formatting,
OpenAPI parsing, whitespace and the ten-file public-boundary check passed.

## Native metadata-update recovery — 2026-10-08

The isolated native runner passed retained patch authentication after restart,
durable uncertainty/hold preservation, backup/restore and replay denial, with
zero customer financial records. It uses a deliberately invalid management
credential to prevent transport after validating the saved patch. See the
[native recovery checkpoint](package-lookup-recovery-verification.md) for exact
scope. Acknowledged-write reconciliation recovery, container/Compose runs and
live qualification remain open.

### Retained read reconciliation recovery — 2026-10-08

The gateway now attempts reconciliation from an already saved successful bound
read before claiming a new read. This closes the interruption window between
read-result persistence and reconciliation. Storage still enforces the exact
original binding, current read grant/account revisions, retained unexpired
snapshots, authenticated encryption domains and exact patch matching. A failed
qualification cannot release the hold or replay an existing read identity.

The PostgreSQL fixture
`asset_group_reads_dispatch_original_account_and_finish_after_disconnect`
passed with a successful encrypted bound read persisted before the reconcile
handler runs. Its transport closure panics if invoked, so the passing result
proves this recovery path made no additional upstream request. It also checks
the reconciled audit and released hold. OpenAPI parsing and public-boundary
checks passed for the five changed implementation/contract files.

This is controlled database/handler evidence, not process restart/restore,
container or live Supplier qualification. Those acceptance gates remain open.

### Native process and restore qualification — 2026-10-08

A freshly built gateway passed `scripts/native-asset-recovery-smoke.py` against
an isolated disposable PostgreSQL cluster. The fixture prepares the encrypted
patch through the real API, then seeds a clearly synthetic acknowledged write
and successful bound encrypted read before stopping the gateway. After a new
process starts, the real reconcile endpoint succeeds from that saved read.
The deliberately invalid management credential prevents upstream transport.
Exactly one bound read remains, the hold is absent, and safe history reports
reconciled. A database dump restored into a separate database and another new
gateway process preserve the reconciliation timestamp, read identity,
ciphertext digest, expiry, single read binding and released hold.

The same run preserves encrypted listing/lookup results and unresolved audit,
and proves uncertain update replay denial after restore. No customer balance
entries, reservations or charges were created. All 18 asset-package helper
unit tests passed; public-boundary checks passed for the three harness files.
This qualifies controlled native restart/restore only. Synthetic acknowledgments
are not live Supplier acceptance, and the current container image remains
separately unqualified for this increment.

### Container checkpoint through 0187 — 2026-10-08

A fresh Linux/arm64 public-source image now passes both direct and Compose
package smoke with update, listing and lookup fixtures enabled. The packaged
reconcile endpoint recovers the acknowledged update from its retained encrypted
read after restart. Backup/restore retains the immutable reconciliation,
released hold and single read binding. The separate invalid-credential update
remains uncertain and replay-denied. This supersedes the earlier statement
that this increment has only native recovery evidence.

[Package evidence](evidence/package-2026-10-08-0187.json) identifies the exact
image, source snapshot and harness hashes. Synthetic grants/acknowledgments
remain controlled fixtures and do not qualify live rights or behavior. Upgrade
from the preceding image and the full release acceptance remain open.

### Upgrade checkpoint — 2026-10-08

The pinned 0178 → 0187 upgrade smoke passed with video and asset fixtures
enabled. An injected DDL failure prevented readiness and left old migration
receipts unchanged; removing the failure allowed all pending migrations to
apply exactly once. Workspace records, original asset credentials and prepared
asset requests survived. Video state, original charges and uncertain liability
also survived without duplicate settlement or replay. This qualifies migration
and existing-data preservation; it does not imply the old image supported
metadata-update intents, which were introduced later. The direct/Compose
fixtures above separately qualify those new records across restart/restore.
