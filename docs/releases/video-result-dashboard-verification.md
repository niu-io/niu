# Video result dashboard checkpoint

Reviewed 2026-10-07. Scoped implementation and local evidence only; V07/V15/V16 and all overall release gates remain open.

Signed-in members can read local result availability and explicitly load a bounded video or optional last frame using their selected workspace key, without copying its secret. The shared backend authorization enforces current workspace/model access and compatible Guardrails. API/SDK responses contain no signed Supplier URLs. Readers can retrieve; writers confirm permanent local-reference deletion. Status and financial records remain available.

The dashboard previews the received body and offers a download of that body. Temporary preview URLs are revoked on replacement, scope change, deletion and unmount. Missing optional frames are hidden; unavailable references remain unavailable after reload. Generation's configured last-frame checkbox is separate from whether a frame was actually saved. Downloads, metadata reads and deletion do not retry automatically.

Migration 0135 was restored to its already-applied form after the development server detected a checksum mismatch. Append-only migration 0136 adds strict 24-hour retention and deletion-marker protection. Its upgrade test preserves existing encrypted references while shortening an overly long lifetime; it does not extend retention or reset the database.

## Verification

- Eleven PostgreSQL media-job tests passed, including the 0135→0136 upgrade, immutable retention, deletion and recovery.
- Five gateway Video scenarios passed, with public/dashboard availability, current scope and model checks, reader deletion denial and permanent deletion.
- All 142 JavaScript SDK tests passed, including raw-body delivery, cancellation, scoped availability and dashboard result operations.
- Dashboard type checking and gateway/storage Clippy with warnings denied passed.
- All 42 affected Video and Chat regression tests passed. The suite covers explicit loading, unsafe/oversized bodies, revocation, scope changes, writer confirmation, reader restrictions and saved-job result-panel restoration.
- OpenAPI resolves 161 local references. Public-boundary checks passed.
- Rendered desktop and 390-pixel review used the production Video components in an isolated test entry, compared with the inspected fal Input/Result pattern and Niu's shared surfaces. A locally generated one-second MP4 verified native playback and download; optional-frame absence, deletion confirmation/cancellation, unavailable results and the configured last-frame checkbox were inspected. This was synthetic test media, not a live Supplier generation. The temporary entry and media were removed.
- The actual signed-in development Video route restores its workspace/key and honestly reports no supported video route. No fake production Supplier or job was seeded.

## Remaining acceptance

Qualify a real authorized video channel and positive TLS/CDN media delivery. Implement and qualify required media inspection, complete queue/run/end-to-end lifecycle timing and customer Logs/Usage/Billing traversal. Exercise packaged restart/upgrade and complete asset/reference/liveness requirements. These checks do not establish live generation, upstream cancellation/refund, indefinite media availability or full release acceptance.

## Current integration regression — 2026-10-07

After the image-library and release-script changes, the current JavaScript SDK
build and all 142 SDK tests passed. Dashboard type checking passed, and the combined
Video/Logs suite passed 63 tests across five files. These checks cover saved result
availability/download/deletion, observed lifecycle and billing presentation,
request controls and Logs video drilldown for the tested local subsets. They do
not replace a fresh rendered review, authorized live video or packaged recovery;
V07/V15/V16/V17 and the complete release remain open.


## Safe retrieval diagnostics — 2026-10-08

The saved-result control now translates recognized, status-matched
`media_result_*` errors into fixed customer-facing messages. It never renders
arbitrary error bodies or server messages. Error JSON reads are bounded to 8 KiB;
unknown types, mismatched statuses, malformed/oversized bodies and HTML retain a
generic safe message. Upstream unavailability, timeout and saturation leave the
saved reference and preview retry available; only local HTTP 404 changes local
availability. No automatic retrieval or generation retry is added.

Seven component/transport tests and dashboard type checking passed. Browser
review inspected the actual OpenRouter Chat controls and equivalent Niu Chat/
Video navigation; this increment preserves the existing result layout and shared
Button rather than introducing a new surface. The actual development Video route
has no qualified model for the demo key. A temporary controlled harness rendered
the real VideoResult component with production theme/styles at desktop and
390 × 844: timeout, destination and busy messages were readable, the preview
button stayed enabled, and the longest message caused no horizontal overflow.
The harness files and agent tabs were removed and viewport override reset.

This verifies error handling and the rendered component, not live generation,
positive HTTPS result transport, a complete saved-video page or V07/V15. No
Supplier/model or saved customer record was fabricated to bypass that gap.

## Late deletion response isolation — 2026-10-08

A new deferred-response regression reproduced a stale deletion callback clearing
another job's already-loaded preview and showing a false deleted state. The
result component now checks its aborted scope immediately after the DELETE
response, before clearing object URLs or changing deletion/confirmation state.
This changes client callback handling only; the backend deletion remains bound
to its original route and is not retried or undone.

The regression failed before the fix and passed afterwards. Current VideoView
and VideoResult suites passed all 21 tests, and dashboard type checking passed.
A temporary isolated browser fixture mounted the production result component,
started a synthetic pending deletion, changed jobs, loaded the new job's local
PNG preview, and then released the original response. At 1280×720 and 390×844,
the current preview and Download link remained and no deleted state appeared.
No upstream calls or saved product data were involved. Temporary fixture files
and browser tab were removed and viewport reset.

These checks do not qualify live video generation, positive public HTTPS result
transport, current upstream link expiry or the full result lifecycle gate.
