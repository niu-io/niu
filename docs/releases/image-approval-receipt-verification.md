# Image approval receipt checkpoint

Reviewed 2026-10-07. Reference-image generation remains unavailable.

Migration 0143 adds immutable, private image-approval metadata. The storage API
requires an opaque consented runtime approval and records its exact image hash,
processing fingerprint, detector revision, input position and workspace/key policy
snapshot. It rechecks current key access and policy state under the existing
workspace coordination lock. It records no image, inline encoding, endpoint,
credential, detector response body or financial amount.

Fresh isolated PostgreSQL acceptance passed using a real local HTTP detector and
canonical PNG input. It verified persisted metadata, mutation/deletion rejection,
cross-workspace rejection despite both workspaces being detector-authorized,
invalid position, withdrawn consent, stale policy and revoked-key rejection.
Failed writes leave no additional receipt. Required-detector coverage was
requalified on 2026-10-07: a request requiring two detectors rejected one receipt
without leaving a binding, then accepted complete coverage. Receipt recording creates no attempt,
reservation or balance entry. All six storage admission regression tests, storage
Clippy with warnings denied, public-boundary and scoped whitespace checks passed.

Reproduce receipt and request-binding acceptance with the disposable PostgreSQL
runner. It generates isolated credentials and does not load development data:

```sh
python3 scripts/test-postgres.py --package niu-storage --test image_processing image_approval_receipts_are_immutable_scoped_and_policy_current
```

Migration 0144 adds immutable request bindings for the exact validated body,
image positions, pinned model/schema/route and workspace/key policy epochs.
Fresh isolated PostgreSQL acceptance passed on 2026-10-07 through the public
runner (one matching test passed). Storage acceptance checks every required detector per image, partial-coverage
rollback and exact replay, changed text, moved positions, missing
approvals and receipt reuse across attempts. It also checks policy changes and
revocation without dispatch or balance entries. This is a preparation boundary;
receipts are not yet enforced by the final gateway dispatch path. The runner’s
five safety tests cover credential isolation, unmatched filters, cleanup after
test/startup failures and integration-target forwarding. Gateway policy/consent management, denial auditing, retention
controls and the complete live and packaged workflow remain open. Migration 0142
still blocks required image-inspection dispatch; recording approval cannot bypass
it. This checkpoint establishes no live detector effectiveness or Supplier input
qualification. See [image processing](../reference/image-processing.md).

## Gateway synthetic inspection

The workspace-scoped preview endpoint and JavaScript SDK now require separate,
current image consent and workspace write authorization. An isolated PostgreSQL
fixture passed on 2026-10-07 with a local HTTP detector: reader/foreign-workspace
and missing/stale-consent denials made no detector requests; remote URLs were
rejected; exact-content clear and matched responses were distinguished from a
mismatched hash. Preview responses excluded content and private configuration,
and no receipt, binding, attempt or customer balance entry was created. All 145
SDK tests passed. This is a synthetic transport/authorization checkpoint, not
saved consent, policy activation, live effectiveness or generation qualification.

```sh
python3 scripts/test-postgres.py image_detector_preview_requires_current_consent_and_workspace_write_access
```

## Durable policy consent

Image requirements now use separate image-processing consent in immutable workspace
policy revisions. Fresh isolated PostgreSQL acceptance passed on 2026-10-07:
consent survives reconstructed application state; reader edits, stale consent and
concurrent stale revisions are rejected; withdrawal creates a new revision;
rollback after changed retention conditions is rejected. A text request under the
required image policy is denied before creating an attempt. Saving or withdrawing
consent makes no detector call. SDK policy types include the separate field. All
five policy unit tests, 145 SDK tests and gateway Clippy with warnings denied
passed; public-boundary and scoped whitespace checks passed.

Required image policies remain fail-closed for every inference path while final
approval enforcement is unavailable. This checkpoint does not qualify reference
input dispatch, real process restart or the owner-facing management workflow.

## Atomic dispatch recheck

`Store::mark_image_dispatched` now rechecks existing exact-request bindings and
opaque runtime approvals in the dispatch transaction. Missing bindings cannot be
created by this operation; changed bodies, stale policy/key state and unqualified
image requirements remain rejected. The shared regular dispatch helper preserves
successful intent commits and separately committed denial audits.

Fresh isolated PostgreSQL acceptance passed on 2026-10-07: the image receipt/binding
fixture and all 13 dispatch-order/policy-audit regression tests passed. These are
controlled storage checks. Gateway image admission and a qualified live channel
are still required; reference generation remains unavailable.

## Complete receipt guard — PostgreSQL checkpoint

Migration 0168 replaces the blanket image-policy dispatch rejection with a
database check for a current immutable request binding and coverage by every
required detector at every image position. Binding and receipt policy epochs
must match the inspected request; missing coverage retains the safe dispatch
denial. The expanded PostgreSQL fixture checks ordinary-dispatch bypass denial,
one valid exact-content intent and duplicate rejection alongside the existing
content/policy/key cases. One matching test passed against an isolated PostgreSQL database through migration 0168 on 2026-10-07. This is storage acceptance, not gateway or live-channel qualification.

Gateway reference admission remains unavailable until the actual image
inspection, content rewriting and final dispatch path is connected and
qualified. No live channel is enabled by this storage increment.

## Inline gateway integration — API checkpoint

The direct video gateway now has an inline PNG/JPEG/WebP preparation path for
configured schemas and current required image consent. Text rules inspect a
separate text projection; images retain their exact canonical encoded bytes.
Parent/key detector requirements compose before disclosure, inspection produces
scoped immutable receipts, and final dispatch uses the atomic request/receipt
recheck. Failed inspection stops before attempt creation and balance reservation.

Gateway compilation and one matching PostgreSQL/API fixture passed on
2026-10-07 through migration 0168. The controlled test covers absent consent, successful exact-content
forwarding with prompt redaction, a matched verdict and revocation during
inspection. Remote images, image-only requests, audio/video references, complete
discovery/dashboard workflows and live detector/Supplier qualification remain
open. No full V03/V15 or release gate is passed by this increment.

## Inspection authorization checkpoint

Each inline inspection now rechecks active key access and the complete parent/key
policy epochs in a short coordinated database transaction before starting the
runtime. A changed policy returns a conflict; revoked or expired access is denied.
The receipt and dispatch checks remain independent. No policy lock is held across
decoding or detector network I/O: an already-started inspection can finish after
revocation, but cannot obtain a current receipt or authorize generation.

One matching isolated PostgreSQL storage test passed on 2026-10-07, covering
current authorization, changed-policy rejection and revoked-key rejection in
addition to immutable receipt and exact dispatch binding checks. This does not
prove cancellation of detector disclosures already in flight.

The routed inline-image PostgreSQL/API regression also passed after this change
(one matching test). Exact image forwarding, prompt redaction, absent consent,
matched verdicts and revocation during inspection retained their expected
behavior. Live detector effectiveness and the complete reference-input journey
remain unqualified.

## Whole-request image capacity checkpoint

The gateway reserves slots for all reference images in every required detector
before any inspection starts. Failed partial reservations release their slots;
approved images retain theirs through dispatch. Two runtime tests passed,
including a two-image batch, exact reference retention, exhaustion and capacity
recovery. Sixteen image decoder/inspection/configuration integration tests also
passed. The isolated routed PostgreSQL fixture passed with an added two-image
request against a one-slot runtime: it produced zero detector and generation
calls. These are controlled local checks on 2026-10-07, not live qualification.

## Inline admission recheck — 2026-10-08

One matching isolated PostgreSQL/API regression passed against the current
migration set. Added malformed-base64, invalid-image-byte and remote-URL cases
all return client errors without echoing the supplied reference, creating an
attempt, invoking the detector or submitting generation. The same test retains
absent-consent and whole-batch capacity rejection, exact inspected image
forwarding with prompt redaction, blocked verdicts and key revocation during
inspection. No customer charge or reservation remains after the fixture.

The API reference now describes this configured, consented inline image subset
and its current administration path. These controlled checks do not qualify
remote retrieval, live inspection effectiveness, Supplier entitlement or the
complete reference-input customer journey; V03/V15 remain open.

## Unbound asset admission checkpoint — 2026-10-09

The isolated PostgreSQL/API regression
`video_inline_images_require_exact_inspection_and_current_key_at_dispatch`
passed against the current migration set (one matching test). Both
`POST /v1/video/estimate` and `POST /v1/video/jobs` reject raw `asset://`
references, percent-encoded scheme variants and uppercase scheme variants,
alongside malformed inline bytes and unsupported remote references. Each case
returns a client error without echoing the reference, invoking inspection,
creating an attempt or submitting generation. The fixture also verifies no
customer balance entry or reservation remains.

This protects the current unsupported-input boundary. It does not implement
reusable asset generation: accepted ingestion and even an observed Active status
remain insufficient without separately qualified account, model, role, channel
and current authorization binding. V03/V08–V12 remain open.
