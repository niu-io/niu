# Niu media request validation

`niu-media` validates video requests against explicitly configured, versioned model and channel schemas. It preserves accepted content order and Unicode, maps the public model alias to its configured upstream model, applies declared defaults and rejects unsupported controls before transport.

Schemas bound request size, input counts and text/media sizes; define required and mutually exclusive controls; and restrict input roles, HTTPS URLs and inline Base64 MIME types. Supplier model storage validates the schema and its alias/upstream mapping before saving capabilities. Saved model revisions retain the existing optimistic concurrency contract.

This crate contains no public video endpoint, job worker, entitlement probe or callback authentication. A configuration declaration is not live qualification. HTTPS checks are syntactic: DNS, redirects, destination safety, media format/dimensions and remote fetch limits still require transport validation. Inline input checks validate encoding and size, not media contents. No schema here establishes model support merely by listing controls.

Request surfaces must be qualified per channel. [Channel creation documentation](https://docs.wecitytech.com/docs/video/create-task) documents top-level `frames_per_second`; the [official Volcengine SDK model](https://github.com/volcengine/volcengine-go-sdk/blob/master/service/arkruntime/model/content_generation.go) exposes a different create-request surface. Do not infer compatibility from generic forwarding.

Verification: `cargo test -p niu-media`; PostgreSQL-backed `niu-storage` Supplier tests verify durable schema revisions and mapping rejection.

## Direct query decoding

`query::DirectQueryProtocol` checks the expected upstream job and model before normalizing status. Only success responses expose configured reported completion quantities; missing, malformed and zero are distinct. Unqualified cancellation and other statuses remain Unknown. Error messages are discarded, and private result URLs have no Debug or Serialize implementation. URLs receive syntactic validation only; transport and fetch policy remain required.

Optional provider timestamps preserve missing/invalid chronology explicitly. They are not measured queue/run intervals. A missing download does not imply free generation. The configured meter does not establish that a particular channel's usage field has that unit: live contract qualification remains necessary.

The decoder follows the direct query envelope represented in the [official SDK](https://github.com/volcengine/volcengine-go-sdk/blob/master/service/arkruntime/model/content_generation.go). Wrapper envelopes require separate adapters; no permissive nested fallback is provided. Tests do not establish callback authenticity, output lifetime or live channel compatibility.

## Bounded query transport

`transport::query_job` performs one GET through Niu's shared DNS-checked, redirect-disabled client pool. It validates configuration before dispatch, bounds the total deadline to at most 60 seconds and limits response bytes both by declared length and while reading chunks. HTTP error bodies and transport details are not returned in its safe error enum. It performs no generation POST, automatic retry, storage update or billing action.

The endpoint and identity must come from an authorized, qualified pinned route. A reusable polling primitive does not establish live Provider support or implement a restart worker. Local HTTP fixtures cover success, redirect denial, sized/chunked oversized bodies, error status, deadline and invalid configuration with zero dispatch.

## One-shot submission transport

`submission::submit_job` accepts only a schema-validated request and sends one POST through the shared endpoint policy. It bounds credentials, response bytes and deadlines; the receipt retains only the upstream reference and configured protocol revision without Debug/Serialize. The caller must commit authorization, immutable route binding and financial admission before invoking it.

Endpoint/configuration rejection is pre-dispatch. Every timeout, HTTP error, malformed or oversized response after POST is conservatively uncertain: no nonexecution, refund or safe retry follows. There is no automatic POST retry or fallback. Fixture tests verify mapped models, bearer credentials, one dispatch across each uncertain outcome and zero dispatch for invalid configuration. This transport is not yet wired to gateway admission or durable receipt storage and does not qualify a live channel.

## Bounded inline image admission

`image_input::DecodeService::decode_inline` accepts only canonical Base64 PNG,
JPEG and WebP data URIs. It checks encoded length before copying, acquires the
same shared capacity as byte decoding and remote retrieval, and decodes off the
async executor. Decoded image bytes retain that capacity until released; callers
can forward the exact validated encoding rather than a mutable source URL.
Malformed content and excessive decoded size fail with safe errors. Animation
remains unavailable. Decoding is not content inspection or dispatch permission;
current workspace authorization, processing consent, required inspection and
qualified channel capability must still precede reference generation.

## Exact-content image inspection adapter

`image_inspection::inspect` implements Niu's separate version-2 image detector
contract. It sends the decoded image's canonical inline encoding, SHA-256 of its
original encoded bytes and the configured detector revision. A Clear response
must echo that hash, revision and schema version exactly; Matched, unknown,
malformed, mismatched and failed responses produce no approval. Responses are
bounded to 4096 bytes, the total deadline to 30 seconds, with no retry or redirect.
An `ApprovedImage` owns the same immutable image and shared decoder capacity.

This contract needs a separately qualified adapter; existing text detectors do
not support it merely because their endpoint accepts JSON. Callers must establish
current workspace authorization, explicit image-processing consent, allowed
recipient/region/retention and declared unmetered execution before invoking it.
Gateway policy activation, durable decision attribution and reference dispatch
are not integrated. Live detector effectiveness, all-frame coverage and Supplier
input support remain unqualified. No existing text consent enables this path.

## Image processing runtime and consent

`image_detector::Runtime` composes bounded decoding and exact-content inspection.
Its separate image-processing consent is bound to a fingerprint of the processing
contract and complete detector configuration, including recipient, region,
retention, endpoint, revision, authorized workspaces and resource limits. Missing
consent, stale consent, an unauthorized workspace or undeclared unmetered execution
is rejected before credentials, decoding or network processing. Settings require
canonical non-nil workspace references and bounded decoding/deadline parameters;
credentials come from the server environment and never enter a fingerprint.

This processing grant supplements current gateway workspace/key authorization;
it does not establish it. Gateway policy management, durable decision receipts
and dispatch rechecks remain unimplemented. The runtime is not automatically
activated by text detector settings or existing text processing consent.

The runtime returns an opaque `ProcessingApproval`, distinct from raw transport
approval. It binds the exact image to its workspace and complete configuration
fingerprint. `approval_current` rechecks scope, consent and current processing
configuration; an approval for a different authorized workspace or superseded
configuration cannot pass. The approval retains decoding capacity and exposes no
Debug/Serialize content. Gateway dispatch must still apply this recheck and its
current key/policy authorization before use.
