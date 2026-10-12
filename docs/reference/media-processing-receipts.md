# Exact-content media processing receipts

`Store::record_media_processing_approval` records metadata from an opaque
`niu_media::media_detector::ProcessingApproval`. Only an actual compatible
MediaV3 Clear response can create that approval; local parsing, configuration
discovery and a caller-provided verdict cannot create one.

Before recording, the store checks the current runtime's workspace authorization,
kind, configuration fingerprint and revision against the approval and explicit
consent. The detector must also occur in the pinned workspace or key policy with
matching kind, fingerprint and affirmative media-processing consent. A conflicting
parent/key binding is rejected. The shared current-key and policy-epoch predicate
then runs under the existing workspace coordination lock in the recording
transaction. Concurrent policy changes or key revocation cannot produce a receipt
for the obsolete snapshot.

Migration 288 adds immutable `media_processing_approvals`. Receipts contain scope,
Key and detector identity, kind, MIME type, exact byte length and content hash,
position, policy epochs, elapsed time and recording time. They contain no source
media, encoding, upstream response, endpoint, credentials or financial quantity.
The supported prepared MIME types are `audio/wav`, `audio/mpeg` and `video/mp4`.
Recording uses the existing transaction-local 250 ms lock and 2 s statement
limits; pool acquisition and whole-operation latency are not covered by those
limits.

A receipt does not authorize Provider delivery, mark an attempt dispatched,
reserve funds, determine billable duration or post a charge. Gateway policy
activation, exact request/asset binding and atomic dispatch remain separate
implementation work. The storage facility compiled from a clean committed tree;
actual receipt creation and its concurrent revocation behavior remain unverified
without a genuinely configured MediaV3 service. No synthetic Clear response or
fixture result qualifies this business path.

## Actual activation boundary and saved-state migration

Native revision `7e42a43b1ea82ef39aaa3b7265109e3937b5ad9e` was executed
against an isolated copy of retained actual business data. The Gateway applied
migration 288. Nine actual HTTP reads/writes exercised audio/video policy
activation refusal (501), withdrawn consent, unsupported image kind, malformed
fingerprint and duplicate detector refusal (400), and unchanged policy reads
before and after restart. Valid bindings are recognized but cannot be activated
until exact inspection, Provider delivery and atomic dispatch are connected.

A separate reader reopened the stopped source and final PostgreSQL instances.
Full-row fingerprints of the original financial/request, Supplier, model and
guardrail-history/head records matched. It independently checked successful
migrations, the immutable receipt trigger and saved response digests. No approval,
model generation or external inspection request was created. An empty receipt
table is a preservation observation, not positive receipt acceptance. This
qualifies the exercised migration and refusal boundary, not media enforcement.

## Prepared request bindings and coordinator integration

Migration 289 adds immutable request identity and receipt-to-request bindings.
Scoped foreign keys, unique approval identity and preparation triggers constrain
scope, position, policy epochs, schema and the still-undispatched attempt. A
receipt cannot be reused for a second request. Native revision
`daf09e6a4299e0e7a3b1e2bc1b0803c7e3afdb82` applied this migration to a stopped
copy of the preceding actual saved-state run. Actual policy reads/refusals and
restart preserved the complete original financial, Supplier, model and policy
records; a separate native reader independently reopened both databases. No
approval or successful binding was invented to exercise this migration.

The registered coordinator and storage facilities at `3a0fff05` pass clean-tree
Gateway static checks. The coordinator bounds input positions, reserves required
detector capacity, checks complete original bytes and supported presentation
facts before any disclosure, and rechecks current key/model/policy/source access
before each real detector call. Actual approvals become scoped receipts. Source
loading must still be bounded by its caller; this does not establish a global
memory or delivery bound.

`Store::bind_media_request` currently prepares text plus inspected inline WAV/MP3
audio only. It revalidates the exact body against the current pinned direct Ark
schema, checks current key/model and route identity, requires all parent/key
audio detector receipts and binds the exact bytes, body hash and schema. Mixed
image/video paths and arbitrary remote URLs are rejected by this incremental
entry point. Final dispatch remains internal and unconnected. The Gateway
coordinator is compiled but has no active request caller yet. Real positive
inspection, receipt insertion, request binding, Provider delivery and complete
mixed-media dispatch remain unverified or unfinished; policy activation stays
disabled. These facilities do not close S08-2 or qualify Ark service success.
