# Video request and image-input checkpoint

Reviewed 2026-10-07. Partial foundations for M01 and V02–V04/V15; no release gate is complete. Gateway generation remains text-input only.

## Implemented boundaries

- Versioned per-channel request validation rejects unsupported fields, invalid control types/ranges, incompatible effective controls, oversized/malformed content, disallowed roles and invalid URL/Base64 inputs. It preserves ordering and Unicode and applies only the configured upstream model/defaults. Supplier storage rejects alias/model mismatches and invalid schemas.
- Inline PNG/JPEG/WebP declarations require matching container headers. The separate decoder applies those same checks, fully decodes static images and enforces encoded-byte, dimension and pixel-buffer limits. APNG/animated WebP, truncated/trailing PNG/WebP containers and JPEGs without the required ending or containing concatenated/trailing images are rejected. JPEG marker traversal respects segment lengths, entropy byte stuffing and restart markers before requiring final termination. Unsupported formats remain unavailable.
- A shared DecodeService admits one to four operations without queuing excess input, runs blocking decoding off async threads and retains capacity across download, decoding and pixel consumption. Cancellation cannot release a running worker slot; failure releases capacity and returns a safe error.
- Remote reference retrieval reuses the bounded media downloader: public HTTPS/DNS checks and connection pinning, no redirects/proxies/credentials, identity encoding, bounded chunks and timeout. WebP reference support does not broaden existing video/last-frame response formats.
- Decoded pixels retain immutable encoded bytes without Debug/Serialize output. Inline references use those exact bytes, with checked Base64 expansion and a maximum reference length before allocation. Callers must still bind approval and revalidate roles, complete body size and current authorization.
- Video discovery/admission share policy composition. Key/workspace model and Provider restrictions cannot weaken each other; unsupported inspection modes and malformed policies fail closed.

## Verification evidence

The latest `cargo test -p niu-media` run passed 41 tests. Relevant cases cover all three decoded formats; wrong MIME, corruption, animation, byte/dimension/pixel/reference-size bounds; pool configuration, clones, retained results, cancellation and worker failure; unsafe remote destinations; encoding/type response rejection; immutable-byte round trips; and reference-to-request ordering, role and size validation. Remote response integration uses local HTTP fixtures; it is not positive live TLS/CDN evidence.

Two targeted gateway policy tests passed. Earlier fresh PostgreSQL Supplier fixtures covered schema update concurrency, fresh-Store retrieval, ownership, independent credentials/model subsets and secret-safe serialization. Media Clippy with warnings denied, public-boundary and scoped whitespace checks passed. Earlier locked gateway/import attribution checks are historical checkpoints, not complete release acceptance.

## Video text inspection

The shared local inspector now extracts video text blocks, preserves controls,
roles and order, and applies existing original-text block/redaction composition.
It rejects media content and does not claim video output inspection. Extraction
checks at most 32 blocks and 65,536 total text bytes before constructing the
inspection envelope; a follow-up targeted run passed both video-text tests,
including aggregate and per-block overflow rejection. All 31
Guardrail unit tests passed, including text redaction, mandatory blocking despite
redaction and unchanged input on failure. Public-boundary and whitespace checks
passed. A follow-up run passed three video extraction tests, including ordered detector
text and rejection of mixed media. Shared preparation now explicitly rejects
video output-rule inspection as incompatible.

Text-only video creation now uses shared bounded inspection preparation before
credential retrieval or paid admission. It preserves the selected route and
tariff, revalidates transformed content against that route's schema and binds
the actual inspection outcome to immutable policy revisions. Local input rules
are supported; detectors, media input and output inspection remain unavailable.
Estimates remain read-only and do not represent prompt approval. Shared preparation
rechecks unsupported detector/output requirements from its own policy snapshot,
so a policy change cannot activate an unqualified inspection path.

Fresh isolated PostgreSQL verification passed all five gateway video tests after
integration. The personal-route fixture now proves a blocked prompt causes zero
upstream submissions, the Supplier receives redacted text, and durable bindings
record `redacted` or `allowed`. The prepaid API and dashboard fixtures also install local input rules: blocked
prompts cause zero Supplier submissions and leave both reservation and balance
entry counts unchanged; redacted funded requests still complete the original
settlement/recovery checks. All five tests passed on a fresh isolated PostgreSQL
database. Scoped access fixtures also passed. All 33 Guardrail unit tests and gateway Clippy with
warnings denied passed. These fixtures do not qualify live channels, media
inspection, policy-race concurrency or the complete release workflow.

## Inline decoder admission checkpoint

On 2026-10-07, shared image admission gained bounded canonical Base64 data-URI
handling for PNG/JPEG/WebP. It rejects excessive encoded input before copying,
acquires shared capacity before Base64 allocation, and performs decoding in its
blocking worker. Retained pixels hold capacity against both byte and inline
admission. Tests verify exact input/forwarded bytes, supported MIME types,
corruption, malformed encoding, size boundaries, saturation and capacity recovery
following rejection. All 43 media tests and media Clippy with warnings denied
passed, as did public-boundary checks. This is a prerequisite for gateway image
inspection, not inspection approval; reference generation remains unavailable.

## Exact-content image detector checkpoint

A separate version-2 image inspection transport now sends canonical decoded-image
encoding with its SHA-256 and configured detector revision. Only an exact Clear
response produces an approval owning the immutable image and shared decoding
capacity. An actual local HTTP fixture verifies clear/matched verdicts, content,
revision and version mismatches, unknown verdicts, extra fields, oversized/error
responses, redirect denial, deadlines and zero dispatch for invalid configuration.
Each valid transport call makes one request with no retry. The approval preserves
the original encoded image; retained approval still consumes decoding capacity.
All 44 media tests, media Clippy with warnings denied and public-boundary checks passed on 2026-10-07.
This is Niu's adapter contract, not existing vendor compatibility or measured
inspection effectiveness. Gateway consent/policy integration, durable decision
binding and reference dispatch remain required. Text processing consent does not
permit image processing.

## Image processing authorization checkpoint

The image runtime now combines bounded decoding and exact-content detector
transport behind separate image consent. It requires a matching configuration
fingerprint, an authorized canonical workspace reference and declared unmetered
execution before reading credentials or processing the input. Fingerprints bind
the versioned image contract, recipient, region, retention, endpoint, detector
revision, authorized scope and resource limits. Tests prove denied and stale
consent reject even malformed private input before decoding, policy-cost denial,
configuration-change invalidation and malformed scope/endpoint/limit rejection.
All 46 media tests, media Clippy with warnings denied and public-boundary checks
passed on 2026-10-07. This runtime has separate gateway configuration and scoped discovery; policies
remain inactive; current key authorization, durable approval receipts, policy rechecks
and exact-image dispatch still need integration and acceptance. No reference
channel or real inspection service is qualified by these local checks.

## Gateway image configuration and discovery checkpoint

A fresh local rerun on 2026-10-07 passed all 16 tests across image input,
inspection transport and detector consent. Coverage includes bounded decoding,
format and container rejection, unsafe remote destinations, retained admission
capacity, exact content/revision binding and consent before transport. This
qualifies those local mechanisms only; the gateway still rejects reference
video inputs until final inspection and dispatch integration is qualified.

The image runtime now applies its configured deadline to decoding and inspection
together. Two focused runtime unit cases passed, including deterministic
blocking-executor saturation: queued decoding times out without detector egress,
then capacity recovers after the queued work drains. Approval scope/content
binding also passed. This does not enable reference-video dispatch or establish
hard decoder CPU/process-memory isolation.

On 2026-10-07, separate validated image-detector configuration and runtime
construction were integrated into the gateway. Workspace read discovery returns
only assigned image detectors, declares activation unavailable, and excludes
endpoints, credential sources and internal scope identifiers. Fresh isolated
PostgreSQL API acceptance passed reader discovery, unauthenticated rejection,
cross-workspace rejection, no-store responses and empty unassigned discovery.
Configuration acceptance passed separate image/text parsing, invalid endpoint,
resource-limit/name rejection and legacy defaults. All 144 JavaScript SDK tests
passed, including scoped bodyless discovery, cancellation and invalid scope
rejection. Public-boundary and scoped whitespace checks passed.

Gateway Clippy with warnings denied now passes after a behavior-preserving cleanup
of the workspace-deletion permission check. No UI, policy
activation, paid admission or reference dispatch is enabled by discovery. See
[image processing](../reference/image-processing.md) for the contract and remaining
integration requirements.

## Storage dispatch requirement guard

Migration 0142 adds a database dispatch guard for required image detectors.
Until durable image approval binding is implemented, a nonempty or malformed
image requirement in the current workspace or assigned key policy cannot
transition an attempt from `not_sent` to `may_have_executed`. Earlier dispatch
guards establish policy/key coordination locks; this guard reads both current
policy scopes and rejects with safe missing-input-binding attribution. Empty
image requirements preserve ordinary text admission. Applied migrations remain
unchanged.

Fresh isolated PostgreSQL verification on 2026-10-07 passed all six storage
admission tests: workspace/key/malformed image requirements, ordinary text
control, policy revision changes, prepared and compatibility admission failures,
missing inspection results and opposing workspace batch lock ordering. Gateway
Clippy with warnings denied, public-boundary and scoped whitespace checks passed.
This guard prevents bypass through storage admission; it does not implement image
policy activation, detector effectiveness or approval-backed reference dispatch.

## Runtime approval binding checkpoint

Runtime approval now has an opaque type distinct from transport verdicts and
binds exact encoded-image SHA-256, detector revision, workspace and consented
configuration fingerprint. An actual local HTTP fixture proves canonical content
preservation, expected bearer authentication, cross-workspace rejection even when
both workspaces are authorized, changed-recipient rejection despite renewed
consent, revoked-consent rejection and retained-capacity behavior with no extra
request when saturated. Capacity release permits a subsequent fresh inspection.
All 47 media tests, gateway Clippy with warnings denied and public-boundary checks
passed on 2026-10-07. Durable policy/receipt binding and final dispatch integration
remain open; this checkpoint does not enable reference generation.

## Remaining acceptance

- Qualify the complete reference-input workflow beyond the locally integrated inline image-plus-prompt subset. The [gateway inspection checkpoint](image-approval-receipt-verification.md#inline-gateway-integration--api-checkpoint) covers consented inspection, immutable exact-content receipts and current-access checks; remote references and live channel acceptance remain open.
- Qualify model/channel formats, roles, counts, dimensions, inline support and live HTTPS/CDN retrieval. URL-only channels require a qualified immutable upload/asset mechanism; inspecting one fetch cannot approve a later mutable URL fetch.
- Implement required content inspection and supported all-frame coverage before enabling animation. Decoder-internal allocation limits are best effort; hard CPU/process-memory isolation is not established.
- Qualify callbacks independently, safe recovery/credential changes, complete pricing/settlement and packaged/API/SDK/rendered customer workflows using the linked release checkpoints. Client abort does not prove upstream cancellation.

Schema declarations, successful decoding and local fixtures do not enable media generation or qualify a Supplier. The [channel request reference](https://docs.wecitytech.com/docs/video/create-task) and [official Volcengine SDK](https://github.com/volcengine/volcengine-go-sdk/blob/master/service/arkruntime/model/content_generation.go) differ; neither replaces exact live channel acceptance. See [video jobs](../reference/video-jobs.md) for operational boundaries and [first-release](first-release.md) for the complete remaining scope.
