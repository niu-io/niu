# Individual ordinary-asset lookup

Current status: platform-only original-page dispatch, immutable outcomes and
scoped operational history and encrypted result recovery have controlled local
acceptance evidence through migration 0182. Customer controls, package recovery
and live qualification remain open. Earlier checkpoints below are chronological.

## Checkpoint — 2026-10-08

The media library implements a bounded signed GetAsset request against the
[official Ark contract](https://docs.volcengine.com/docs/ark/get-asset-api?lang=zh).
This is an internal transport foundation for V08–V10, not a completed asset
lifecycle or an enabled gateway operation.

A request retains the original validated listing item’s private identity, group,
project and media type. The response must match all four, as well as the expected
operation metadata. Listing and lookup share item validation. Snapshot encoding
rejects rebinding an item to a different group or project. Temporary URLs,
moderation payloads and raw upstream error details are discarded. Processing,
Active and Failed are observations; none establishes reuse rights or readiness.

Transport uses a fixed endpoint, signed POST, public DNS validation and pinning,
a maximum 1 MiB response and a deadline of at most 30 seconds including DNS and
body reads. It does not redirect, retry or use a proxy. Private request fields
have no diagnostic formatting implementation.

These validated types do not prove authorization: callers must derive them from
authorized retained content and recheck original account credentials and an
operation-specific grant. Migration 0179 adds a separately reviewed GetAsset
qualification to the platform-administrator API and SDK. There is no gateway
lookup dispatch, retained lookup result, customer API or rendered control in this
increment. Qualification still returns dispatch_available: false.

## Verification

The complete media suite passed 73 tests, with one live TLS test ignored. Five
new tests cover status observations and discarded private data, exact identity
and scope validation, duplicate fields, signing, snapshot rebinding rejection
and invalid transport bounds before network access. Media, storage and gateway all-target Clippy passed with warnings denied.
The isolated gateway listing regression passed, covering encrypted recovery,
revocation, erasure, bounded continuation and safe audit history.
Changed-file public-boundary and whitespace checks passed. No live Supplier call
was made.

The migration-0178 package checkpoint predates these changes and does not qualify
this lookup transport. Full asset CRUD, readiness-aware references, customer
controls and live qualification remain open.

## Separate lookup qualification — 2026-10-08

Migration 0179 extends the operation constraint with GetAsset without changing
existing grants. Storage, the platform-only authorization API, OpenAPI and SDK
accept the distinct operation. Omission still means CreateAssetGroup. The same
nonzero evidence references, expiry bounds, original account/credential revisions,
account lock and independent revocation checks apply. Qualification never
releases credentials or authorizes automatic dispatch.

One isolated storage PostgreSQL test passed through migration 0179. It verifies
that simultaneous creation, group-read and listing grants do not qualify lookup,
wrong workspace/account/credential revisions are denied, and lookup revocation
preserves other grants. One isolated gateway PostgreSQL test passed, including
ordinary-owner, inference-key and invalid-token denial, explicit lookup operation,
dispatch_available: false and independent revocation. All 159 JavaScript SDK
tests passed after a fresh build, including lookup operation and cancellation.
Media, storage and gateway all-target Clippy passed with warnings denied after
the grant extension. OpenAPI YAML parsing, formatting, whitespace and the
15-file public-boundary check passed.

This increment is not included in the migration-0178 package checkpoint. No live
Supplier call or full lifecycle acceptance is claimed.

## Original-page lookup claim — 2026-10-08

Migration 0180 adds immutable lookup claims with the original listing, exact
lookup grant, bounded item position and encrypted snapshot digest. No upstream
asset identity, descriptive content or charge is added to the audit table.

Storage locks the original account and retained page, checks the current original
listing grant and a separately current GetAsset grant, verifies original account
and credential revisions, and rejects revoked, erased or expired sources. A
caller-provided local decoder must authenticate the workspace/listing AES-GCM
context. Storage revalidates the decoded page and chooses the requested item
itself. The claim commits before credentials are returned; a repeated lookup ID
cannot release credentials again. No network I/O occurs inside the transaction.

The isolated listing/lookup storage regression passed through migration 0180,
including competing duplicate claims, wrong workspace/account/listing, invalid
positions, decoder failure, invalid decoded content, exact signed request,
immutable audit, lookup revocation and deletion of the source page despite a
fresh lookup grant. The fixture uses synthetic ciphertext and a synthetic local
decoder; this is not gateway authenticated-decryption or live transport evidence.
The existing zero-billing assertion also passed. Changed-file public-boundary and
whitespace checks passed. Storage all-target Clippy passed with warnings denied
for this increment.

Gateway lookup dispatch, completion/outcome recording, retained lookup results,
customer controls and package restart/restore qualification remain unimplemented.
The migration-0178 package checkpoint does not include migrations 0179–0180.

## Durable completion and safe history — 2026-10-08

Migration 0181 adds immutable first-completion lookup outcomes. Successful
transport records the observed Active, Processing or Failed asset status
separately from transport failure. Failures accept only the bounded shared
category vocabulary; raw upstream messages cannot enter this record. Completion
is scoped to the original workspace, requires an existing claim and remains
possible after grant revocation so already-dispatched work can finish its audit.
Competing or repeated completions cannot replace the first outcome. No completion
means unresolved, with unknown status, completion time, duration and reason.

The storage history projection contains only routing references, operational
status, observed asset status, start/completion times, measured duration and safe
reason. It scopes both records and pagination cursors to the original workspace
and account. It retains history after source-content deletion and grant revocation.
No name, upstream asset identity, URL, credential, evidence digest, procurement
amount or customer charge is included. Routing identifiers must not become UI
labels. This storage function does not expose a new customer or admin endpoint.

The expanded isolated storage PostgreSQL regression passed through migration
0181. Coverage includes successful transport observing a Failed asset, completion
after revocation, wrong workspace and unknown claim denial, invalid duration and
raw-reason rejection, concurrent conflicting failure completion, immutable
outcomes, reconstructed-store history, unresolved null fields, exact safe field
count, scoped and unknown cursors, page bounds, and retained history after source
erasure. The original zero-billing assertion also passed. Storage all-target
Clippy passed with warnings denied; formatting, whitespace and the seven-file
public-boundary check passed.

Gateway dispatch and completion integration, authenticated result retention,
rendered customer controls, package recovery and live qualification remain open.
The migration-0178 package checkpoint does not include migrations 0179–0181.

## Gateway dispatch and operational API — 2026-10-08

The platform-only lookup POST decrypts a retained page with its original
workspace/listing AES-GCM context, obtains a one-shot original-account claim,
then dispatches the fixed signed transport. Four slots are held across detached
tracked work, with no admission queue, a 30-second transport limit and a
35-second outer deadline. First completion is recorded even after caller
cancellation. Responses contain only routing reference and transport/asset status;
no descriptive lookup content is retained. The GET history endpoint is scoped,
newest-first and bounded to 100 records with a scoped cursor. Both use no-store.

The controlled gateway regression passed after adding lookup dispatch, signing,
duplicate denial, safe timeout recording, caller disconnect, revoked grant denial,
workspace role and inference-key denial, private-data omission and history
pagination. Its expanded capacity case also passed: four held dispatches including
one disconnected caller, fifth-request 503 before claim, four durable outcomes,
and subsequent acceptance of the unconsumed lookup identity. The final rerun after
aligning lookup/deletion lock order and adding the history no-store assertion
passed. A separate isolated storage regression passed the lookup/erasure race.
These are controlled dispatch fixtures; no live Ark request was made.

All 161 SDK tests passed after a fresh build, including scoped lookup payloads,
item bounds, cancellation, duplicate-failure propagation without retry and history
pagination validation. OpenAPI YAML parsing, whitespace and changed-file public
boundary checks passed. Final media/storage/gateway all-target Clippy passed
with warnings denied, and changed Rust formatting passed.

The migration-0178 package checkpoint predates this runtime. Retained lookup
content, rendered customer controls, full CRUD/reuse, package recovery and live
qualification remain open. No full release gate passes from this increment.

## Retained-result storage foundation — 2026-10-08

Migration 0182 adds separately retained opaque ciphertext with a 24-hour expiry,
immutable content/expiry and erasure-only updates. Success audit and ciphertext
commit atomically; a deletion tombstone created before completion suppresses
later content storage. Erasure and expiry preserve immutable operational audit.
Bounded cleanup is integrated with background payload retention, independently
of other retention domains.

Recovery checks the exact original lookup and listing grants, account and
credential revisions, current credentials and expiry. A newly issued grant cannot
revive a result bound to a revoked original grant. Lookup content has its own
retention domain: deleting the source listing does not itself delete a retained
lookup result. Callers must authorize and delete each retained content domain.

The media snapshot encoder binds the exact dispatched asset identity, group,
project and media type before encoding one validated item. Temporary URLs and raw
upstream detail are excluded. The gateway must apply authenticated encryption
with a lookup-specific workspace/identity context before storage; that integration
is still unimplemented. Storage accepts opaque ciphertext and does not establish
that it was encrypted or decoded correctly.

One isolated storage PostgreSQL regression passed through migration 0182,
covering fresh-store recovery, wrong workspace/account denial, invalid ciphertext
bounds, duplicate completion, immutable content, erasure before completion,
independent grant revocation, non-revival by a new grant, deletion after revocation,
explicit expired-content hiding and background purge. Safe history and zero-charge
assertions also passed. The fixture uses synthetic ciphertext rather than
claiming AES-GCM acceptance. All 36 media unit tests passed, including the new
exact-binding single-item snapshot test. Changed-file public-boundary and
whitespace checks passed. Final media/storage/gateway all-target Clippy passed
with warnings denied, and changed Rust formatting passed.

Gateway lookup encryption, result recovery/deletion endpoints, SDK support,
rendered controls, package recovery and live qualification remain open. The
migration-0178 package checkpoint does not include migration 0182.

## Encrypted gateway recovery and erasure — 2026-10-08

Successful lookup snapshots now pass the exact-dispatched-identity encoder and
AES-GCM encryption under the distinct `niu.asset-lookup-result.v1` domain plus
original organization/workspace/lookup identity. Ciphertext and success audit
commit together. POST keeps its safe operational acknowledgement; GET on the
saved lookup path decrypts and revalidates exactly one item and returns only its
name, observed status/type and timestamps. No upstream identity, URL, credential
or raw error is serialized. No additional upstream call occurs on recovery.

GET requires current exact original grants, account and credentials and unexpired
content. DELETE uses platform authorization and original scope, remains available
after grant revocation and preserves audit. Both listing and lookup retained
content have explicit independent erasure domains. Content is automatically
hidden at expiry and erased by bounded background cleanup.

The controlled gateway PostgreSQL regression passed through migration 0182,
including encrypted bytes without plaintext names, recovery with a reconstructed
application and cipher, wrong workspace/identity and cross-domain decryption
denial, safe six-field asset projection, no-store, grant-revoked withholding,
post-revocation deletion, and ordinary workspace/inference-key denial for both
GET and DELETE. Existing signed dispatch, caller-disconnect, capacity, history and
zero-charge assertions also passed. The expanded in-flight-erasure case passed:
completion preserves success audit while the tombstone prevents content storage.
No live Supplier request was made; packaged process restart/restore remains a
separate unqualified gate.

All 162 SDK tests passed after a fresh build, including recovery and erasure
scope, methods, cancellation and UUID validation. OpenAPI parsing, whitespace and
changed-file public-boundary checks passed. Final media/storage/gateway
all-target Clippy passed with warnings denied. Its initial run identified an
unused in-flight test response; the test now asserts its acknowledgement, and
the PostgreSQL regression passed again before the final Clippy pass.
Customer lifecycle controls, full CRUD/reuse, package recovery and live
qualification remain open; no full release gate is passed.

## Native process recovery — 2026-10-08

The isolated native gateway runner passed encrypted individual lookup retrieval,
process restart, SQL backup/restore and unresolved audit preservation through
migration 0187. See the [lookup recovery checkpoint](package-lookup-recovery-verification.md)
for exact scope, verifier correction and the still-unqualified container build.
Synthetic saved responses and grants do not establish live Supplier rights.
