# Ordinary asset-group deletion transport

Status: internal transport and platform-only consent API are implemented. A platform-only one-shot dispatch endpoint is implemented. Live, reconciliation,
packaged and rendered acceptance remain open.

The [official DeleteAssetGroup contract](https://docs.volcengine.com/docs/ark/delete-asset-group-api?lang=zh)
specifies the fixed Ark action/version, original group and project, access-key
signing and an empty success Result. Deletion is irreversible and cascades to all
assets in the group. Real-person groups have additional upstream restrictions;
this implementation does not establish eligibility to delete those groups.

The media module signs the exact original group/project and DeleteAssetGroup
action, then makes one bounded POST to the fixed Beijing endpoint. It reuses the
existing transport's redirect/proxy rejection and response/deadline bounds. It
never retries. The decoder requires matching action, version, service and region,
an empty object Result, and no error envelope. Invalid bounds fail before signing
or network dispatch. The request and signer do not implement Debug.

Construction validates neither ownership nor destructive consent. The gateway must bind a saved ordinary group to its original
workspace/account/credential, require a separately qualified deletion grant and
explicit cascading-deletion consent, commit a durable one-shot claim, preserve
uncertain outcomes and reconcile them without replay. A read or update grant is
insufficient. HTTP not-found or another unacknowledged response must not become a
successful deletion by inference. No live deletion was performed.

Transport validation alone does not close V08–V10 or F09. Durable authorization,
claims/outcomes, reconciliation, SDK/contracts, safe customer controls, retention
and live channel qualification remain mandatory.


## Local automated checkpoint — 2026-10-09

All 46 media-library tests passed after tightening Result decoding to require an
empty JSON object. The first run caught that a Serde empty struct also accepted an
empty array; that implementation was rejected. The final tests reject array,
null, boolean, nonempty object, duplicate Result, missing metadata, wrong
operation/region/version/service and explicit error envelopes. Signing checks
bind the exact original identity/project and distinguish deletion from reads.
Invalid response/deadline limits are rejected without network access. Existing
media transport, inspection, capacity and retrieval tests also passed.

Media all-target Clippy passed with warnings denied. Targeted source/document
public-boundary and whitespace checks passed. No live
Supplier, gateway deletion workflow, restart or packaged acceptance is claimed.


## Separate reviewed grant — migration 0190

Deletion now has a distinct `DeleteAssetGroup` qualification in the existing
platform-only authorization API and SDK. It remains a review record, with
`dispatch_available: false`; no deletion endpoint is enabled. The append-only
migration extends only the allowed operation list and does not alter existing
grants. Scope, configuration/credential revision, expiry, evidence validation and
revocation use the shared locked authorization lifecycle. This record is not the
explicit user consent required for a particular cascading deletion.

The disposable PostgreSQL storage test passed non-inheritance from combined
create/read/list/lookup/update grants, exact operation persistence, workspace and
revision mismatch denial, immutable-update/delete rejection, revocation and
preservation of the unrelated update grant. All 170 SDK tests passed with separate
update/deletion qualification projection and cancellation, while unknown operations
remain rejected before networking. OpenAPI parsing and targeted source/contract
public-boundary and whitespace checks passed. The fresh PostgreSQL gateway authorization test passed ordinary-owner/API-key
denial, platform-only issuance, false dispatch availability, reopened readback,
revocation and preservation of unrelated lookup rights. Storage and gateway
all-target Clippy passed with warnings denied. Released migration bytes through
0189 matched the earlier frozen snapshot; 0190 is append-only.


## Specific consent foundation — migration 0191

Storage now records explicit confirmation of irreversible cascading deletion for
one successful saved ordinary group and one exact current deletion grant. Consent
is immutable and actor-bound, expires within fifteen minutes or sooner with its
grant, and can be separately revoked. Repeated identical saves do not renew expiry;
changed targets, grants, lifetime or actors conflict. Concurrent identical saves
produce one record. Missing cascading confirmation, incorrect workspace, unfinished
group creation and non-deletion grants are rejected. Revoked or expired consent
cannot be restored by repeating its save. Grant/configuration/credential changes
must be rechecked before any future dispatch.

Preparation and revocation serialize on the original Supplier configuration lock,
matching qualification/revocation locking. No request content, upstream identifiers
or secrets are copied into consent records. The group reference resolves through
the original saved creation binding. The append-only revocation audit survives
reconnect and cannot be erased through update/delete. This is a storage foundation,
not a complete deletion workflow. The authenticated controller described below
requires explicit confirmation and supplies the actual actor;
calling a storage method does not itself prove a user approved deletion.

The first disposable PostgreSQL test passed concurrent idempotency, retained expiry
and reconnect, expiry capping, scope/operation/confirmation denial, immutable rows,
revocation idempotency, expired replay denial and grant revocation. The final
actor-binding regression passed in a fresh disposable database. Storage and gateway
all-target Clippy passed with warnings denied; targeted public-boundary and
whitespace checks passed.


Before dispatch, an atomic claim must recheck consent/grant expiry and revocation,
original configuration/credential revisions, ordinary-group identity and outstanding
mutation holds. It must prevent duplicate or concurrent group mutation, persist an
immutable outcome and preserve uncertainty across process replacement. Consent
preparation alone does not establish those dispatch guarantees.


## One-shot claim and outcome foundation — migration 0192

The internal storage claim now rechecks exact original account/configuration and
credential scope, current deletion qualification, explicit unexpired consent,
revocations and outstanding metadata-mutation holds in one vendor-locked
transaction. It commits a unique per-group deletion claim before returning
credentials. Concurrent claims and replacement consent cannot replay the group
mutation. Metadata-update claims use the same lock and reject a committed deletion
claim before decrypting their patch.

The first persisted deletion outcome wins and is immutable. Only allowlisted
failure categories and nonnegative duration are retained; raw errors and upstream
content are excluded. Acknowledged does not claim independently verified absence.
Uncertain outcomes preserve the group mutation fence across reconnect. There is
currently no fence-release or deletion reconciliation mechanism; this limitation
is explicit. The dispatch checkpoint below uses these claims.

The fresh PostgreSQL deletion test passed concurrent one-shot handoff,
wrong-workspace/revoked/expired consent denial, replacement-consent replay denial,
metadata-update blocking in both directions, retained uncertainty after reconnect,
first-outcome preservation and immutable claim/outcome rows. A duplicate local
creation receipt bound to the same original credential/project/group cannot bypass
the deletion fence or reach metadata-patch decoding. Storage and gateway all-target
Clippy passed with warnings denied. All four existing asset qualification, handoff, read and listing/update regression
tests passed in fresh PostgreSQL databases. Targeted boundary/whitespace checks
and immutable released-migration comparison passed. This foundation does not qualify upstream dispatch, recovery, consent
UI, SDK deletion dispatch or complete asset CRUD.


## Platform consent API and SDK checkpoint — 2026-10-09

Platform administrators can prepare, read and revoke specific deletion consent
through the Supplier configuration's `asset-management/group-deletion-consents`
endpoints. Preparation requires explicit cascading confirmation, a lifetime of
1–900 seconds and the exact saved ordinary-group intent and deletion grant. The
authenticated actor is supplied by the server. Identical saves preserve expiry;
revoked consent cannot be restored by replay. Consent preparation does not dispatch deletion.

Status exposes only state, creation/expiry time, a safe outcome reason and duration,
and `dispatch_available: false`. It excludes original upstream identities, secrets,
internal references and commercial data. `consented` describes the consent record;
it does not assert that the current grant is eligible for dispatch. Claimed and
recorded outcomes take precedence over subsequent consent revocation. Revocation
is idempotent and does not cancel claimed work or delete upstream assets.

The fresh disposable PostgreSQL gateway test passed platform-only access, ordinary
owner denial, invalid-token denial, explicit confirmation, exact Supplier/workspace
isolation, idempotent preparation and revocation, replay denial, safe readback and
reopened-router persistence. It also verified that no deletion claim was created.
All 172 JavaScript SDK tests passed, including explicit confirmation, bounded
lifetime/identity validation before networking, exact payload projection,
cancellation and no automatic write retry. OpenAPI parsed successfully; storage
and gateway all-target Clippy passed with warnings denied. No live or rendered
deletion acceptance is claimed. Reconciliation, customer controls and packaged acceptance remain open.


## Platform one-shot dispatch checkpoint — 2026-10-09

`POST .../group-deletion-consents/{consent}/dispatch` now uses the fixed bounded
transport after the storage claim rechecks consent, qualification and original
bindings. Four execution slots bound local concurrency. The worker is detached
from the requesting handler, tracked for graceful shutdown and bounded to 35
seconds around the transport's 30-second deadline. It persists acknowledged or
allowlisted uncertain outcomes before returning. Missing outcomes after process
loss remain unresolved; the durable fence prevents automatic replay.

The fresh disposable PostgreSQL gateway test passed ordinary-owner/invalid-token
and wrong-Supplier denial, original group/project signing, handler-abort survival,
retained transport uncertainty, reopened-router readback, concurrent-call denial,
expired/revoked consent denial before transport, successful acknowledgement for a
separate original group, acknowledgement replay denial and zero customer charges.
Exactly two claims were retained, one for each dispatched group; denied consent
created no claim. A fresh saturation regression held all four local execution
slots, verified routed HTTP 503 before any claim, preserved consented status and
then completed the same one-shot workflow after capacity returned. It used a controlled transport and did not delete
live upstream data. All 173 SDK tests passed, including explicit dispatch path,
exact scope projection, cancellation and one attempt after a 503 response. OpenAPI
parsing, gateway all-target Clippy with warnings denied, targeted public-boundary
and whitespace checks passed. These results do
not qualify independent absence reconciliation, successful live deletion,
process replacement during dispatch, customer lifecycle UI or
packaged recovery.


## Reconciliation contract review — 2026-10-09

The official [GetAssetGroup contract](https://docs.volcengine.com/docs/ark/get-asset-group-api?lang=zh)
specifies successful group details and exact project scoping. The inspected page
and Ark error-code reference did not establish a group-deletion-specific absence
response or its authorization semantics. Generic HTTP failure, not-found text,
an empty asset listing, or unavailable credentials must not prove group absence.
Do not substitute a third-party proxy's error codes for the official contract.
Independent deletion reconciliation remains open pending a supported absence
contract and channel evidence. The retained mutation fence must not be released
on that basis, and deletion must not be automatically repeated.
