# Image processing prerequisites

The direct video gateway supports configured inline PNG/JPEG/WebP references
with a text prompt, current image-processing consent and exact-content inspection
approvals. Other reference shapes remain unavailable. These mechanisms do not
qualify any Supplier or detector; live channel acceptance is a separate gate.

## Configuration

Image detectors use a separate `[image_detectors.<name>]` section. Required settings
are `endpoint`, `api_key_env`, `detector_revision`, `recipient`, `region`, `retention`,
`authorized_workspaces`, `declared_unmetered`, `timeout_ms`, `maximum_encoded_bytes`,
`maximum_width`, `maximum_height`, `maximum_decoded_bytes`, and `concurrency`.

Inline video preparation reserves decoder slots for the complete image set in
every required detector before starting inspection. Insufficient capacity
rejects the request before detector disclosure. Each successful approval keeps
its slot until dropped; unused reservations are released on cancellation or
failure. Configure concurrency to accommodate the intended reference count
within the bounded decoder limits; a schema's image count alone does not grant
processing capacity.

Startup validates names, HTTPS endpoints (loopback HTTP is permitted for isolated
tests), canonical workspace references and bounded resource limits. URLs cannot
contain credentials, query parameters or fragments. Detector credentials stay in
the server environment. Text detector configuration and consent do not enable image
processing. An unmetered declaration is not proof of service terms or supply rights.

## Scoped discovery

`GET /admin/v1/organizations/{organization}/projects/{project}/guardrails/image-detectors`
requires current workspace read authorization and returns only image detectors
explicitly authorized for that workspace. Responses use `Cache-Control: no-store`.
They include declared recipient/region/retention, contract revision, configuration
fingerprint and processing limits. They exclude endpoint, environment-variable
name, credentials and internal workspace references. `policy_activation` is false.

The JavaScript SDK exposes `listWorkspaceImageDetectors(scope, options)` with
cancellation support. It does not inspect content or create a consent record.

## Consented synthetic inspection

`POST /admin/v1/organizations/{organization}/projects/{project}/guardrails/image-detectors/{detector}/preview`
requires current workspace write permission and a detector explicitly authorized
for that workspace. Send an `image` containing canonical inline PNG/JPEG/WebP data
and `consent` containing `configuration_fingerprint` and
`consent_to_image_processing: true`. Review the discovery disclosure before
consenting. Changed configuration requires renewed consent. The JSON body is
limited to 2 MiB; configured decoding limits may be smaller. Remote URLs are not
accepted by this operation.

The response contains only `outcome` (`clear`, `matched`, or `indeterminate`) and
a bounded reason, with `synthetic: true`, `enforcement: false`, and
`policy_activation: false`. It never returns content, hashes, configuration
fingerprints, credentials or upstream responses. It creates no approval receipt,
request binding, inference attempt or customer charge. A successful test is not
saved processing consent and does not qualify detector effectiveness or enable
reference generation. Transport and malformed-result failures are indeterminate.
Responses use `Cache-Control: no-store`.

The JavaScript SDK exposes `previewWorkspaceImageDetector(scope, detector, input,
options)` with cancellation and no automatic retry. Its response does not grant
permission to dispatch an image to a Supplier.

## Approval boundary

The runtime requires separate image consent matching a fingerprint of the complete
configuration and versioned processing contract. Unauthorized scope, missing/stale
consent or undeclared unmetered execution is rejected before credentials, decoding
or network processing. Canonical Base64 PNG/JPEG/WebP data is decoded with shared
capacity and size limits. Animation remains unavailable.

The version-2 detector request carries canonical image encoding, the SHA-256 of the
exact encoded bytes and detector revision. Only a Clear response echoing the exact
hash, revision and schema version creates an approval. Unknown, matched, malformed,
failed and mismatched responses do not. Requests and responses have bounded deadlines
and sizes, with no retry or redirect. Runtime processing approvals bind the immutable image to its workspace and
consented configuration fingerprint while retaining shared decoding capacity.
Raw transport approval cannot construct this runtime approval type. Final
dispatch must recheck the current consent/configuration and workspace; renewed
consent for changed processing conditions does not validate an earlier approval. No external service compatibility is implied by this
Niu adapter contract.

`timeout_ms` bounds the complete runtime decode-and-inspect operation, including
waiting for the blocking decoder executor. Timeout produces no approval. Work
already queued or running in the native decoder may finish after cancellation;
its capacity remains held until completion. This is a caller deadline, not a
hard CPU or process-memory isolation guarantee.

## Durable image consent in policy revisions

Workspace policy revisions support a separate `image_detectors` array (maximum
four distinct detectors). Each entry contains `detector`, a current
`configuration_fingerprint`, and `consent_to_image_processing: true`. Text
processing consent cannot substitute for this field. Save through the existing
workspace policy endpoint with its expected revision and write authorization.
Policy history retains the immutable consent revision and the change actor.
Remove the entry in a new revision to withdraw the workspace requirement; key
assignments to older revisions remain independent and must also be removed.
Rollback and key assignment revalidate current detector authorization and
processing conditions, so an old fingerprint cannot renew consent after changes.

This is a required, fail-closed policy. The direct video API can process inline
PNG/JPEG/WebP images with a text prompt when the configured model schema permits
them and every required workspace/key detector has current consent and access.
All images must receive exact-content approvals before financial admission.
Text-only requests and other inference protocols still reject nonempty image
requirements. Saving consent alone does not establish live detector effectiveness
or qualify a Supplier's image-generation channel.
The database dispatch guard requires complete current request/receipt coverage.
Attach this policy only to a workspace whose intended requests and configured
channels support the inspected inline subset. Unsupported requests fail closed.
The synthetic preview remains independently consented and does not activate or
reuse saved policy consent.

## Remote retrieval boundary

The media library has a bounded HTTPS image fetch-and-decode primitive. It uses
public-address validation and pinned DNS resolution, disables redirects and
proxies, sends no authorization or cookies, and accepts only bounded
PNG/JPEG/WebP responses. Decoding remains separate from inspection approval.
The caller must establish current access and explicit URL-processing consent
before fetching; the library primitive does not provide either authorization.

This primitive is not connected to video admission or discovery. Remote URLs
remain rejected by the gateway. Enabling them requires consent before retrieval,
whole-request capacity admission, exact downloaded-byte inspection and immutable
forwarding, plus current-key/policy rechecks. Forwarding the original mutable URL
would not preserve the inspected content. Do not advertise remote support from
the existence of this library primitive.

## Remaining integration

Database dispatch rejects missing request bindings, missing detector/image
coverage and malformed required image policies, including key assignments.
Migration 0168's complete receipt guard and the direct inline-image API passed
isolated PostgreSQL fixtures. Remote images, image-only requests and audio/video
references remain unavailable.

Approval-backed immutable metadata records now have a
[storage/API checkpoint](../releases/image-approval-receipt-verification.md). The
inline gateway path performs final pre-dispatch approval/consent rechecks;
complete discovery, owner-facing management, denial investigation and retention
remain required. Storage binds opaque runtime approvals to an exact validated request body, image positions, pinned model/schema, key and policy revisions. An isolated PostgreSQL fixture verifies immutable replay and rejection of changed content positions, missing approvals, reused receipts, changed policy and revoked keys. Bindings require every image to have receipts from every required workspace and
key detector with matching consent fingerprints. Parent/key requirements compose;
conflicting fingerprints and malformed requirements fail closed. Partial coverage
creates no request binding. `Store::mark_image_dispatched` requires an existing
exact-request binding and rechecks runtime approvals, current consent, policy
epochs and key access under the same transaction as dispatch intent. It cannot
create a missing binding during dispatch. The inline API checkpoint is not a
complete reference-video workflow. Reference generation also needs qualified
model/channel formats, roles, body limits and safe immutable input forwarding.
Real detector effectiveness and live Supplier acceptance are unproven.
