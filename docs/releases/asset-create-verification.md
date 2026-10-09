# Ordinary asset creation

Status: request validation, private recovery and fixed-action signing implemented.
No asset-creation dispatch endpoint or live acceptance is claimed. V08–V10 remain
open.

The official [ordinary-asset guide](https://docs.volcengine.com/docs/ark/private-virtual-avatar-library-guide-preview?lang=zh)
requires the original group, public source URL and Image/Video/Audio type, with an
optional name. Creation is asynchronous; an asset must reach Active before reuse.
The [international API](https://docs.byteplus.com/en/docs/modelark/create-asset-api?redirect=1)
has a separate endpoint/region and must be qualified independently. It does not
establish Beijing-channel response or entitlement guarantees.

## Implemented contract

- Retain the exact saved ordinary group and upstream project. Do not silently use
  a default project or accept a replacement identity during private recovery.
- Permit the three declared media types and an optional name of 1–64 Unicode
  characters, excluding whitespace-only names and control characters.
- Bound source URLs to 8192 bytes and normal HTTPS port 443. Reject literal IPs,
  local host forms, credentials, fragments, data URLs and surrounding whitespace.
  This is syntax validation; DNS and network policy remain transport obligations.
- Recover an exact private snapshot of the allowed fields only. Reject duplicate
  fields, null optional names, unknown types, changed scope and moderation
  overrides, including Skip. The snapshot contains a potentially signed source
  URL and must be encrypted before retention; request/signing types omit Debug.
- Sign only CreateAsset at the existing fixed Beijing host and exact original
  body. No network dispatch is performed by the new request module.

## Fresh local acceptance — 2026-10-09

All 50 media-library tests passed. The four new regressions cover the three media
types, Unicode bounds and absent names, exact private reconstruction, wrong scope,
unknown/duplicate/null fields, moderation override rejection, unsafe sources,
fixed-host signing, action separation and invalid signing timestamps. Targeted
public-boundary and whitespace checks passed. Media all-target Clippy passed
with warnings denied.

## Required integration

Before dispatch, bind current CreateAsset qualification, workspace ownership,
original credentials and explicit processing consent to a durable one-shot intent.
Required inspection must cover the exact bytes supplied upstream. Inspecting a
mutable URL and later forwarding that URL is insufficient; provide an immutable
source bound to the approved content or another qualified equivalent. Preserve
uncertain outcomes without automatic replay. Retain safe processing observations
and permit reuse only after authorized Active readback. Complete request/result
retention controls, SDK/contracts, rendered lifecycle controls, restart/package
recovery and live channel qualification. Do not infer file-format, duration,
resolution or moderation coverage from these request checks.


## Separate ingestion qualification — migration 0193

The append-only migration permits a distinct CreateAsset authorization. Shared
platform-only preparation, listing and revocation bind reviewed evidence to the
exact workspace, Supplier configuration revision and original credential revision.
No existing group creation/read/update/deletion grant is upgraded. Qualification
returns `dispatch_available: false`; no media is uploaded and no credentials are
released. Processing consent, exact inspected-content binding and one-shot
handoff remain separate requirements.

The fresh disposable PostgreSQL storage regression passed non-inheritance,
operation persistence, workspace/configuration/credential mismatch denial,
immutable update/delete rejection, independent revocation and preservation of
unrelated update rights. All 173 SDK tests passed with separate CreateAsset
projection and cancellation; unknown operations remain denied before networking.
OpenAPI parsing, targeted public-boundary and whitespace checks passed.
The fresh PostgreSQL gateway authorization regression passed ordinary-owner,
inference-key and invalid-token denial; platform-only CreateAsset issuance;
false dispatch availability; reopened-router readback and preservation of
separate operation rights. Storage and gateway all-target Clippy passed with
warnings denied. This qualification API does not qualify ingestion dispatch,
inspection, immutable hosting, readiness, rendered workflows or packaged recovery.


## Inspected-source storage checkpoint — migration 0194

Migration 0194 separates encrypted source bytes from immutable approval provenance.
The source is reconstructed from a runtime approval, not downloaded again from a
mutable URL. Saving requires its exact scoped receipt and current key/policy;
reads require the same binding and deny expiry/erasure. Explicit erasure removes
ciphertext while retaining provenance. This is private storage only, not a public
source URL, Supplier dispatch authorization or a qualified ingestion workflow.
The fresh disposable PostgreSQL regression passed exact receipt binding,
cross-workspace/key denial, duplicate-save conflict, immutable metadata and
ciphertext updates, retained content after reopening the Store, expiry denial,
policy-change read denial and idempotent erasure with retained provenance. The
fixture uses a controlled seal callback and does not qualify production encryption
or public source delivery. Storage all-target Clippy passed with warnings denied;
targeted public-boundary and whitespace checks passed. Before exposing publication
or ingestion, complete
authenticated-encryption handoff, current detector/processing-consent checks,
short-lived recipient access, restart and
packaged verification. Video/audio source inspection remains separate.


## Binary encryption prerequisite — 2026-10-09

The gateway's existing versioned AES-256-GCM envelope now supports binary
plaintext directly. Existing text encryption delegates to the same primitive and
still rejects non-UTF-8 content when opened as text. No image base64 conversion
is required inside the cipher. Callers remain responsible for bounded content
and domain-separated authenticated bindings.

All four gateway cipher tests passed, including the existing credential,
asset-management and media-result checks. The new binary regression verifies
non-UTF-8 roundtrip, randomized envelopes, wrong-key and tamper rejection,
truncated/unknown-version rejection, and authentication failure when organization,
workspace, API key, source identity or content domain changes. This verifies the
cipher primitive with a source binding; the shared source binding and verified read path are qualified below;
publication and Supplier ingestion remain open. No source URL or
Supplier upload endpoint was enabled. Gateway all-target Clippy passed with
warnings denied; targeted public-boundary and whitespace checks passed. The
running development backend returned ready after the watcher rebuild.


## Verified source encryption integration — 2026-10-09

Storage supplies the fixed versioned organization/workspace/key/source binding to
its seal callback. A verified read authenticates the ciphertext under that binding
and checks the immutable approved byte length and SHA-256 before returning private
bytes and their content type. Unsupported content types and invalid lengths fail
before decryption; mismatched plaintext is never returned.

The real-cipher PostgreSQL fixture obtained an actual runtime inspection approval,
recorded its receipt, saved the exact bytes with the gateway AES-GCM cipher, reopened
the Store and recovered byte-for-byte PNG content. The retained ciphertext did not
contain the plaintext, changing the source binding failed authentication and erasure
prevented decryption. A foreign workspace/key was denied before the open callback.
The verified-read unit test passed wrong-length/hash, unsupported content type,
invalid bound and decryption-failure denial. The existing PostgreSQL source
expiry/policy/erasure regression also passed after the binding change. Storage and
gateway all-target Clippy passed with warnings denied. This is controlled local integration, not a public source URL,
Supplier upload or independently qualified inspection service. Publication must
still recheck current recipient/processing consent, expiry and ingestion rights.

## Required detector coverage — 2026-10-09

Migration 0195 adds immutable source-to-approval links. Saving source bytes now
requires the complete composed workspace/key detector set, with exact scoped,
current receipts for the same content hash and configured fingerprints. Duplicate
receipts or detector names, missing required detectors and stale receipts fail
before encryption or persistence. Source metadata, ciphertext and all proof links
commit atomically.

The fresh PostgreSQL source regression passed: two required detectors reject an
incomplete set and a duplicate receipt before the seal callback; the complete set
saves two immutable proof links and remains readable under its current policy.
Deleting those proof links is rejected. The real gateway AES-GCM PostgreSQL
regression also passed after migration 0195, including reopened-store readback
and scoped erasure. Storage and gateway all-target Clippy passed with warnings
denied; targeted public-boundary and whitespace checks passed.
Earlier private source snapshots lacking
these links are unavailable for handoff and must be inspected and saved again;
their existing erasure path remains available. This does not enable publication,
Supplier dispatch or asset readiness.


## Expired source retention — migration 0196

The gateway's existing five-second maintenance loop now removes expired encrypted
image-source payloads in batches of at most sixteen. It skips locked source rows
and commits erasure tombstones with ciphertext deletion. Source metadata and
detector approval links remain immutable. Expired sources remain unavailable
immediately at their deadline even if a cleanup tick is delayed; cleanup failure
is logged for retry by the next tick.

The fresh PostgreSQL regression verified locked-row skipping, deletion and its
tombstone after lock release, repeat-call idempotence, preservation of unexpired
content, and eighteen expired fixtures removed as batches of sixteen and two
through a reopened Store. Storage and gateway all-target Clippy passed with
warnings denied, public-boundary and whitespace checks passed, and the development
backend returned ready after the watcher rebuild. This qualifies the storage cleanup and native worker
integration only. Packaged maintenance and publication
retention guarantees remain open.


## Encrypted-source admission capacity

Private image staging has initial ceilings of 256 retained payloads / 128 MiB per
workspace and 4,096 payloads / 1 GiB per installation. These are operational
staging limits, independent of customer billing. Capacity counts actual retained
ciphertext, including expired bytes awaiting deletion, and conservatively reserves
128 bytes of encryption-envelope overhead for each new source. All admissions
serialize through a database transaction lock, so separate gateway processes
share the same accounting. Capacity denial occurs before the seal callback and
creates no saved source or proof links; the gateway error mapping is a retryable
503 without exposing usage totals.

The fresh PostgreSQL regression seeded expired retained fixtures, left one
workspace slot, and issued two concurrent saves. Exactly one succeeded and the
other returned the specific capacity error. After bounded expiration cleanup,
the rejected source saved successfully. Unit tests passed both scope count limits,
exact byte boundaries and envelope overhead. The storage regression also rejects
a seal callback that returns more than the reserved envelope overhead, preventing
actual ciphertext from exceeding its admission reservation. Storage and gateway
all-target Clippy passed with warnings denied; public-boundary and whitespace
checks passed. The rebuilt development backend returned ready. These checks qualify internal
admission storage, not load performance, public source ingestion or packaged
multi-process acceptance.


## Bounded creation transport checkpoint

The internal transport sends one signed CreateAsset POST to the fixed Beijing
Ark endpoint, with a shared DNS/read deadline of at most thirty seconds and a
response limit of at most 1 MiB. It uses the existing no-redirect/no-proxy
transport and performs no automatic retries. Callers must establish current
qualification, exact inspected source delivery, consent and a durable claim.

The response decoder requires the requested action/version/service/region and a
bounded asset identifier, rejects malformed or duplicate known fields and
reported errors, and returns only a private acceptance receipt. It does not
return a readiness state or make the new asset reusable. This follows the
[official asset guide](https://docs.volcengine.com/docs/ark/private-virtual-avatar-library-guide-preview?lang=zh)
for asynchronous creation and the
[official OpenAPI envelope](https://docs.volcengine.com/docs/E-MapReduce/Responseresult?lang=en);
the action-specific reference was not readable in this verification environment,
so exact live-channel response qualification remains open.

All 53 media tests passed. New checks cover valid acceptance, wrong metadata,
invalid identifiers and response shapes, reported errors, malformed/duplicate/
oversized JSON and invalid transport limits rejected before network access.
Existing shared transport tests cover bounded reads and redirect rejection.
Media all-target Clippy passed with warnings denied; public-boundary and
whitespace checks passed. No live upload, public source URL, gateway creation route or readiness workflow
was exercised or enabled.


## Specific image-ingestion consent — migration 0197

An internal preparation method binds the authenticated workspace/API key's saved
image source to one successfully created ordinary group and one exact reviewed
CreateAsset authorization. It requires explicit ingestion confirmation and the
current workspace/key policy. It rejects erased or expired sources, missing
detector proof, wrong-operation grants, stale Supplier/credential revisions,
revoked qualification/credentials and destinations with a deletion claim.
The immutable consent expires within fifteen minutes and no later than either
its source or reviewed authorization. Repeating the exact identity cannot extend
expiry or alter its target. A separate immutable revocation record prevents
resurrection; revocation requires the original scoped key.

The fresh PostgreSQL test passed missing-confirmation, wrong-operation,
foreign-workspace and erased-source denial; valid preparation, reopened-store
idempotence, capped expiry, changed-input conflict, immutable consent, foreign
revocation denial, idempotent scoped revocation and resurrection denial.
Storage and gateway all-target Clippy passed with warnings denied; targeted
public-boundary and whitespace checks passed. No credential, plaintext source, public URL or dispatch authority is returned.
Current detector/recipient configuration, all consent, source and destination
bindings must be rechecked when claiming and delivering the upload. Gateway
dispatch integration, immutable publication and readiness remain open.


## One-shot image-ingestion handoff — migration 0198

An internal claim rechecks the original scoped API key and policy, specific
unexpired/unrevoked consent, retained exact source, complete detector proof
provenance, current CreateAsset qualification and original Supplier credential/
destination binding. It authenticates and verifies the approved source bytes
before committing a unique claim. Only then does it return private bytes, the
original ordinary group and encrypted original credentials. Failed decryption
does not consume the claim. No URL is published or network request dispatched.

First-write immutable outcomes distinguish accepted creation from uncertainty;
neither grants replay, and acceptance does not establish readiness. Pending or
uncertain ingestion fences cascading group deletion, matching original upstream
account/project/group identity. This prevents deletion while a possibly applied
upload remains unresolved.

The fresh PostgreSQL regression passed foreign/revoked consent denial before
decryption, invalid plaintext rollback, exactly one concurrent handoff, original
credential binding, foreign outcome denial, first-outcome preservation, immutable
claim and reopened-store replay denial. Cascading deletion was denied after an
uncertain upload. The existing scoped cascading-consent regression also passed. Storage and gateway
all-target Clippy passed with warnings denied; public-boundary and whitespace
checks passed. The rebuilt development backend returned ready.
Current detector/recipient declarations, immutable publication, gateway
disconnect/process-loss acceptance, outcome reconciliation, readiness and
packaged/live qualification remain open.


## Gateway encryption and ingestion integration

The gateway PostgreSQL fixture now extends real AES-GCM source retention through
specific ingestion consent, verified one-shot handoff and a durable controlled
acceptance outcome. A wrong master key failed authentication without consuming
the claim. Reopening the Store with the correct cipher recovered the exact
runtime-approved PNG and original encrypted asset-management credentials.
Decrypting those credentials signed CreateAsset for the saved original group
and upstream project. The recorded accepted outcome survived another reopened
Store, replay was denied before decryption, and no customer charge was created.

The expanded real-cipher PostgreSQL regression and gateway all-target Clippy
passed with warnings denied; public-boundary and whitespace checks passed.
This is local integration:
the test's source URL and upstream acceptance are controlled fixtures, not a
published source or live upload. Process restart, disconnect handling, immutable
source delivery, current detector/recipient review, readiness and package/live
acceptance remain open.


## Current detector consent at ingestion claim

Claiming ingestion now requires the current detector runtimes explicitly. Every
saved source approval must still match its detector's configuration fingerprint
and authorized workspace. This rechecks recipient, retention and other consent
terms embodied in that fingerprint before source decryption, claim consumption
or credential release. Missing or changed runtimes fail closed without consuming
the claim.

Fresh storage PostgreSQL acceptance passed empty/incomplete runtime denial and
the existing concurrent one-shot/replay checks. The gateway real-cipher regression
changed a detector retention declaration and verified denial before decryption;
the original runtime still recovered the exact approved bytes afterwards.
Storage and gateway all-target Clippy passed with warnings denied; public-boundary
and whitespace checks passed. The rebuilt development backend returned ready.
This qualifies claim-time configuration checking. Source delivery must repeat
current authorization checks; publication, upload dispatch and readiness remain
open.


## Bounded source access — migration 0199

A committed ingestion claim can receive one random bearer token for its exact
source. Storage retains only SHA-256 of that token. Access expires within sixty
seconds and no later than source retention, consent, reviewed permission or API
key expiry. Repetition does not renew or replace it. At most four deliveries
commit; a database row lock serializes concurrent consumers.

Every delivery repeats current API key/workspace policy, source retention,
ingestion consent, original destination, reviewed permission, credential and
detector-runtime checks, then authenticates the saved bytes and their approved
hash. The caller receives only verified source bytes and content type, never
destination credentials. Invalid decryption does not consume a delivery.
Expiration, erasure, revocation or changed processing terms deny delivery.

Fresh gateway PostgreSQL acceptance passed exact PNG recovery through reopened
storage, concurrent fetches, four-delivery exhaustion, no renewal, invalid/unknown
tokens, changed detector terms, wrong-key rollback, consent revocation, explicit
expiry, immutable token records and exact stored-hash checks. The source/
ingestion storage regression also passed after sharing the validation path.
Storage and gateway all-target Clippy passed with warnings denied; public-boundary
and whitespace checks passed. The development backend returned ready.
This is an internal access primitive. HTTP serving, transfer concurrency limits,
cache/referrer protections, a public HTTPS deployment URL, Provider fetch timing,
upload integration and packaged/live acceptance remain open.


## HTTP source delivery checkpoint

The GET source capability endpoint returns the exact verified PNG/JPEG/WebP bytes
with an explicit content type and length, attachment disposition, no-store,
no-referrer and nosniff protections. Queries and bodies are rejected; HEAD and
other methods cannot consume a delivery, and partial range fetches are disabled.
Four process-wide transfer slots remain held until response bodies are consumed
or dropped. Capacity rejection returns 503 with Retry-After without consuming a
delivery. Authorization and retention are rechecked by the storage delivery path.

Fresh gateway PostgreSQL acceptance passed exact PNG content, cache protections,
method/query/range rejection, capacity exhaustion, response-drop slot release and
post-revocation denial. Storage and gateway all-target Clippy passed before the
request-trace redaction change. OpenAPI parsing, public-boundary and whitespace
checks passed. A focused regression passed capability path redaction in request
traces while preserving ordinary route paths.

Token issuance remains internal. Public HTTPS deployment, Provider fetch timing,
gateway ingestion dispatch/recovery, packaged acceptance and live qualification
remain open. This checkpoint does not qualify the complete asset ingestion flow.


### Real HTTP transport acceptance

The real-cipher PostgreSQL test also passed a loopback TCP server/client fetch,
verifying the exact approved PNG, HTTP Content-Length and Content-Type,
no-referrer and full-body slot release. The same run retained method/range,
overload, dropped-response and consent-revocation checks. This exercises network
framing in addition to in-process routing; it does not establish public TLS
reachability or Supplier fetch compatibility. Public-boundary and whitespace
checks passed for the expanded test.


## Interrupted ingestion recovery — migration 0200

Maintenance scans at most sixteen unfinished claims older than sixty seconds per
tick, using an indexed queue and skipping locked rows. It appends an immutable
uncertain timeout outcome and measures elapsed time from the committed claim.
That interval includes downtime; it is not measured Provider latency. Claims and
their deletion fences remain intact. Recovery never publishes another source
capability, releases credentials or repeats CreateAsset. The first outcome wins
if a worker returns after recovery; readiness and reconciliation remain separate.

Fresh PostgreSQL acceptance reopened storage and recovered eighteen backdated
claims in batches of sixteen and two, then verified idempotence, measured elapsed
time, replay denial and rejection of late accepted outcomes. Fresh claims were
left untouched. The broader scoped source/consent/claim regression also passed.
Storage and gateway all-target Clippy, public-boundary and whitespace checks
passed. The development backend returned ready. This qualifies interrupted-claim
classification, not gateway ingestion dispatch or upstream reconciliation.


## Customer ingestion consent API checkpoint

The original source API key can prepare, retrieve and revoke consent through
`/v1/media/image-ingestions/{id}`. Preparation checks current workspace policy,
exact retained source, original ordinary group and reviewed CreateAsset grant.
Identical active consent is idempotent; revoked consent cannot be resurrected.
Revocation is idempotent and remains separate from cancellation of an upstream
write. Status excludes credentials, source access tokens, upstream identifiers
and procurement data. It distinguishes consent, expiry, revocation, a pending
claim and immutable accepted/uncertain outcomes. Dispatch remains unavailable.

Fresh real-cipher gateway PostgreSQL acceptance passed unauthenticated denial,
foreign-workspace preparation denial, foreign-key read/revocation isolation,
identical preparation, repeated revocation, revoked-consent reuse denial and
customer response exclusions. Existing exact-byte TCP delivery checks also
passed. Storage/gateway all-target Clippy and OpenAPI parsing passed. The SDK
includes prepare/retrieve/revoke methods; acceptance covers methods, credentials,
empty 204 responses and invalid-input denial before transport.

This is an API checkpoint. Source upload/inspection preparation, gateway upload
dispatch, public HTTPS and Provider fetch qualification, reconciliation,
readiness-aware reuse, customer controls and packaged/live qualification remain
open. No customer page is advertised as a complete asset ingestion flow.


## Bounded gateway ingestion worker checkpoint

`POST /v1/media/image-ingestions/{id}/dispatch` authenticates the original API key,
checks deployment configuration and four-upload capacity before claiming, then
revalidates current policy, inspected source and reviewed original destination.
A tracked worker survives client disconnect. It issues the one short-lived source
capability, decrypts the original credential and sends one fixed bounded
CreateAsset request. The transport allows thirty seconds; the worker allows
thirty-five. It persists an immutable accepted or uncertain outcome before
returning. Acceptance does not assert readiness, and no error authorizes replay.
Interrupted claims remain covered by the sixty-second recovery checkpoint.

Dispatch is disabled without `server.image_source_origin`. The deployment must
qualify its public HTTPS root origin and Supplier fetch timing before enabling
it. The configuration rejects HTTP, IP literals, local hosts, nonstandard ports,
credentials, paths, queries and fragments; client requests cannot choose a
source URL or destination. Configuration is not evidence of live reachability.

Fresh real-cipher PostgreSQL acceptance passed disabled-origin and saturation
denial before claim, original credential signing, exact source capability URL,
one dispatch, disconnect survival, replay denial and persisted accepted status
through reopened storage. The existing consent isolation and real HTTP source
checks passed in the same run. All 175 SDK tests passed, including the matching
dispatch method, credential and request-method checks. OpenAPI parsing and
public-boundary/whitespace checks passed.

This uses a controlled transport and qualifies the native worker subset only.
Public TLS reachability, live CreateAsset response/fetch behavior, readiness,
reconciliation, complete customer controls and a current package remain open.


## Inspected source preparation API checkpoint

`POST /v1/media/image-sources` accepts one inline PNG/JPEG/WebP and a retention
lifetime from one to nine hundred seconds. It reuses the video image-inspection
pipeline: all configured required detectors need current workspace consent and
approval of the exact bytes. The server records approval provenance and seals
those approved bytes under source/key/workspace-bound authenticated encryption.
It accepts no remote URL or caller-supplied moderation verdict. A bounded request
body and four preparation slots limit work; existing workspace/installation
storage ceilings and expiry cleanup apply. The response contains only a source
reference, retention ceiling and saved flag; it publishes no fetch capability.

`DELETE /v1/media/image-sources/{id}` erases only the authenticated key's retained
bytes. Missing or foreign sources are opaque no-ops. Repetition is safe; immutable
provenance remains, and upstream assets are not canceled or deleted.

Fresh real-cipher PostgreSQL/API acceptance passed missing-consent and invalid-key
denial, capacity denial, approved source creation, exact reopened encrypted bytes,
foreign-key erasure isolation, repeated authorized erasure and denied reads after
erasure. Existing ingestion, disconnect, source-delivery and revocation checks
passed in the same run. All 176 SDK tests passed, including source preparation,
erasure, method/body preservation and invalid-input denial. OpenAPI parsing and
public-boundary/whitespace checks passed. Storage and gateway all-target Clippy
passed with warnings denied.

Public HTTPS/Supplier qualification, readiness-aware reuse and reconciliation,
complete rendered customer controls and a current packaged acceptance remain
open. These native API checks do not close V08–V10 or the release.


## Accepted-image readiness storage — migration 0201

Accepted ingestion can claim an original-account GetAsset observation only with
its own current reviewed permission. The read binds the saved accepted image ID,
ordinary group, workspace/key and original credential revision. It accepts no
caller-selected upstream ID, project or account. Uncertain creation, foreign keys,
revoked permissions/credentials and pending group deletion cannot authorize it.
A consent lock serializes one outstanding read; each consent is capped at sixty
reads per rolling hour. Every claim and first outcome are immutable.

The observation records Processing, Active or Failed separately from accepted
creation. Transport failure records a safe reason without inventing an asset
status. Maintenance classifies abandoned reads after sixty seconds in batches of
sixteen, preserving measured elapsed time and immutable history. It permits a
new separately authorized read, never repeats a claimed upload or grants reuse.
Source erasure and ingestion-consent expiry do not erase ownership of an already
accepted upstream asset.

Fresh real-cipher PostgreSQL acceptance passed missing GetAsset permission,
foreign-key denial, concurrent one-outstanding-read admission, original-account
signing and exact accepted asset identity, immutable Processing/Active outcomes,
reopened-storage polling, interrupted-read timeout and permission revocation.
Existing source preparation, ingestion and delivery checks passed in the same run.
Media, storage and gateway all-target Clippy passed with warnings denied.
Public-boundary and whitespace checks passed.

This qualifies storage and request binding under the original reviewed account
configuration. A gateway readiness worker/API, response identity validation,
customer controls, reusable-reference authorization, historical account migration
and live/packaged acceptance remain open. No Active result grants generation use
through this checkpoint.


## Accepted-image readiness API checkpoint

`POST /v1/media/image-ingestions/{id}/readiness/{read_id}` makes one separately
reviewed original-account GetAsset observation. A tracked worker retains one of
four read slots through its bounded request and persistence, surviving client
disconnect. The response is checked against the claimed asset ID, group, project
and image type before any status is saved. Mismatched or failed responses record
only a safe failure category; they cannot report an Active asset. No raw response,
media URL, credential or upstream identifier enters the customer response.

`GET` at the same path retrieves the durable observation without contacting the
Supplier. Successful observation and asset status are separate: Processing is
not Active, and even Active returns `reuse_available: false`. Reusing a claimed
read reference cannot repeat the upstream request. Historical observations remain
scoped to the original active API key; reads retain their separate polling and
interrupted-worker recovery limits.

Fresh real-cipher gateway PostgreSQL acceptance passed Processing observation,
customer status retrieval, foreign-key isolation, response identity rejection,
no replay, saturation before claim and disconnect-surviving Active persistence
through reopened storage. Customer response exclusion and no-reuse checks passed.
All 177 SDK tests passed, including explicit refresh versus persisted retrieval,
request methods and invalid references. Storage/gateway all-target Clippy,
OpenAPI parsing and public-boundary/whitespace checks passed.

This qualifies the native bounded worker and API using a controlled transport.
Live GetAsset qualification, current package, complete customer controls,
historical-account migration and reusable-reference authorization remain open.
It does not reconcile an uncertain creation or close V08–V10.

## Ingestion command validation — 2026-10-09

Dispatch and readiness-refresh commands now reject unknown request fields and
non-object JSON instead of silently ignoring them. Callers may omit the body or
send `{}`; the saved consent, original account and asset binding remain the only
inputs. Authentication precedes command validation. The OpenAPI contract records
these rules and the HTTP 400 response.

The isolated real-cipher PostgreSQL/API regression
`inspected_source_real_cipher_survives_reopen_and_verifies_approved_bytes`
passed (one matching test). Both routed commands rejected asset/account
overrides, arrays and null before upload claim creation. Existing encrypted
source delivery, ingestion and readiness recovery checks in that fixture also
passed. The JavaScript SDK suite passed all 177 tests. This native checkpoint
does not qualify live account/channel entitlement or the complete packaged
source-to-readiness workflow.

## Retained-source availability checkpoint — 2026-10-09

Image-ingestion status no longer advertises dispatch after its inspected source
has been erased or its encrypted content is absent. Availability also requires
unexpired source and consent, no consent revocation or previous claim, plus the
gateway's configured source origin and encryption. Consent and accepted outcome
history remain unchanged; this flag does not replace current-policy, reviewed
permission, detector-term or capacity checks at dispatch.

The isolated real-cipher PostgreSQL/API regression
`inspected_source_real_cipher_survives_reopen_and_verifies_approved_bytes`
passed (one matching test). With origin and encryption configured, the routed
status reports availability before source erasure and false afterward, while
retaining the consented status. Existing scoped source delivery, revocation,
expiry, encryption, upload and readiness recovery checks also passed. This is
native controlled acceptance, not live or complete packaged qualification.

## Ingestion outcome diagnostics — 2026-10-09

Customer ingestion status now includes nullable `reason`, `duration_ms` and
`observed_at` directly from its immutable outcome. Reasons use the existing
allowlist; upstream bodies, asset identifiers, credentials, source capabilities
and procurement data remain excluded. Pending or consent-only work has no
invented duration, reason or observation time. Interrupted-upload recovery still
records elapsed time including process downtime; this is not Provider latency.

The isolated real-cipher PostgreSQL/API regression
`inspected_source_real_cipher_survives_reopen_and_verifies_approved_bytes`
passed (one matching test). It checks null diagnostics before dispatch and saved
accepted-outcome duration/observation through the routed original-key GET after
a disconnected requester. Existing original-account and cross-key isolation
checks remain in the fixture. All 177 JavaScript SDK tests passed; the public
contract and SDK types include the fields. Live uncertainty diagnosis and the
complete customer and packaged journeys remain unqualified.

## Original-key ingestion history — 2026-10-09

`GET /v1/media/image-ingestions` now recovers saved ingestion history without
browser state or remembered consent IDs. Pages contain at most fifty records,
newest first by creation time and identity. `next_cursor` continues through
`before`; foreign or absent cursors return 404. History shares individual-status
serialization, preserves revoked/expired/completed records and never dispatches
or publishes source capabilities. The SDK exposes `imageIngestions.list()`.

The isolated real-cipher PostgreSQL/API regression
`inspected_source_real_cipher_survives_reopen_and_verifies_approved_bytes`
passed (one matching test), including original-key recovery, empty foreign-key
history, foreign-cursor 404, malformed-cursor 400 and complete two-page traversal
with fifty-row bounds and same-statement timestamp ties. Combined pages exactly
match the ordered scoped database history, without duplicates or omissions.
All 178 SDK tests passed, including authenticated body-free continuation and
client rejection of malformed cursors. OpenAPI and SDK guidance are updated.
A later [fresh package checkpoint](package-qualification-2026-10-09.md#current-source-checkpoint) covers history retrieval, diagnostics, isolation and restoration. Pagination ties retain native evidence; rendered customer controls remain open.
