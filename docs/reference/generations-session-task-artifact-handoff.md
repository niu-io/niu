# Generations: sessions, tasks and artifacts — backend handoff

Status: implementation contract with an additive backend increment delivered. Existing Video APIs remain authoritative. The [implemented API/SDK guide](../../apps/docs/src/content/docs/reference/generations.mdx) records exact paths, verification and limitations. Reviewed 2026-10-13.

| Area | Delivery state |
| --- | --- |
| P0 Video sessions and turn/task associations | Implemented; actual existing-task association, concurrency, deletion, archive and restart exercised |
| P0 common typed Chat/Video read projection | Implemented; retained Chat instruction restored through the compatible bridge; positive execution-linked Chat branch recovery unverified |
| P1 historical task inventory | Implemented for Video across saved keys, with exact states and actor privacy; complete text-execution inventory remains open |
| P2 generated-output inventory | Implemented for video and last frame; actual expired outputs refuse download; positive unexpired delivery remains unverified in this increment |
| General retained Video controls/references | New turns retain typed text instructions only; the original Video intent remains authoritative for validated submission input |
| P3 Assets and Person references | Newly added handoff scope; Generations-level inventory, binding and SDK integration remain pending |
| P4 human verification | Newly added handoff scope; the required Generations-level workflow remains pending |
| Frontend timeline and two-browser rendering | Frontend integration and acceptance remain open |

This status does not mark all acceptance items complete. No fixture result supports these delivery claims, and no paid generation was initiated for this increment.

## Outcome

Generations has one conversation experience for Chat and Video. A user submits
an instruction, sees its execution state in the same timeline, and views the
result there. Subsequent instructions create new turns in that saved session.
Tasks and Artifacts are first-level views inside Generations, not new product
rail areas. Tasks finds executions across sessions; Artifacts finds outputs.
Neither is an agent orchestration service.

This work must use existing generated videos for integration acceptance. Do not
call generation or replay creation to obtain new test data. Read saved status
and available result bytes. Do not create reference assets or verification
sessions solely for acceptance; the human-verification entry is a separately
explicit user action, not an automatic step in viewing a video.
If an old result has expired, report that fact rather than regenerate it. Use
fixtures for creation/concurrency failure tests, not paid upstream operations.

## Existing capabilities to retain

| Existing surface | Coverage | Remaining gap |
| --- | --- | --- |
| Video jobs: create, retrieve, list, refresh, wait | Durable task state, original dispatch identity and recovery | Lists are keyed by an inference key; there is no shared session/turn association or dashboard inventory across authorized keys. |
| Video results: availability and binary retrieval | Authorized video/last-frame preview and download, separate expiry/deletion | No cross-task output index for the Artifacts view. |
| Video billing, observations and timings | Customer-safe task diagnosis | Must remain linked to the task, independently of retained output. |
| Dashboard key-scoped Video bridge | Reuses saved jobs and selected-key authorization | Frontend must enumerate keys and cannot treat active-key discovery as a complete historical inventory. |
| Video submission intents | Actor-owned saved text input, optimistic revision and no-resend restoration | A single intent is not a multi-turn session. It expires; references are not a general saved conversation format. |
| Chat sessions and drafts | Actor-scoped durable multi-turn Chat and optimistic revisions | Current payload is a text-comparison contract, not a typed asynchronous timeline. |
| Supplier model mappings and Video schemas | Model-declared channels, inputs and controls | Frontend discoverability work; no replacement backend capability editor is required. |
| Workspace material library | Durable encrypted original files, metadata, scoped member CRUD, SDK and quota enforcement | No Collections, person entity, Artifact-to-Asset promotion or general audio/video reference dispatch. |
| Provider asset groups, assets and operations | Account/model-bound resources, acknowledged creation, processing/Active state and recovery | Not a generic material library; no unified material-to-Provider binding projection. |
| Provider verification sessions | Create/list/read, explicit private H5 link, guarded result query and genuine person-group binding | No person-library association or dashboard entry; actual human completion remains unverified. |

See [Video API and SDK](../../apps/docs/src/content/docs/reference/video.mdx),
`sdks/javascript/src/admin.ts`, `sdks/javascript/src/index.ts`,
`apps/gateway/src/web/inference/dashboard_video.rs`,
`apps/gateway/src/web/inference/video_intents.rs` and
`apps/gateway/src/admin/chat_sessions.rs` for implemented contracts.

## Backend implementation priorities

### P0: durable session and turn association

Extend or bridge existing sessions rather than replace the Video execution engine.
Keep legacy Chat payloads and saved Video links readable. The backend may choose
the storage representation, but the SDK must expose a typed projection:

- Session: stable identity, title, creation/update time, workspace and owner,
  revision, and category (`chat` or `video` initially). A session remains within
  one workspace for authorization and billing. No workspace-selection wizard is
  required in the UI: a chosen API key resolves the scope.
- Turn: stable identity, sequence and created time, typed instruction/inputs,
  retained/deleted/expired content state and associated execution references.
  Missing retained input must not be replaced with a fabricated prompt.
- Task reference: existing execution identity and task kind, associated turn and
  model, saved status, and artifact references. This is a projection of existing
  execution records, not a second mutable copy of their state.

Multiple Video turns must persist in one session. Changing an instruction creates
a new turn and a new explicitly submitted task; it never changes the original
request, idempotency identity, prices or task. Chat turns continue to use their
existing comparison branches without presenting an entire conversation as one
ever-running task. Mixed categories within one session are not required now;
use a common typed timeline without promising unsupported mixed-model semantics.

Session/turn writes use optimistic revision checks. Attaching an existing job is
idempotent and verifies workspace, actor visibility and task ownership. Never
allow clients to assert arbitrary success states, output URLs or job ownership.
Document whether API-created jobs can be attached to an actor-owned session and
which authorized user can do so. Do not silently expose one user's private
conversation because another user has workspace usage access.

Creation and association must recover independently: once dispatch is accepted,
a failed session update must not lead to another paid submission. Retain the
existing intent/idempotency mechanism and expose the saved association on read.
No session read, write, list or association endpoint may initiate inference.

### P1: Tasks inventory and historical read authorization

Provide session-authenticated, workspace-scoped task list/detail reads across
authorized keys. A global dashboard view can initially aggregate these workspace
pages. Server aggregation across all authorized workspaces is optional; key-by-key
enumeration must not be the only way to discover historical work.

List entries need task kind, model display name, creation/update times, exact
saved state, source (`api` or `generations` when known), optional session/turn
association and safe artifact-availability summary. Never substitute an internal
ID for a missing title. Preserve Video's actual states, including
`submission_unknown`, `unknown` and `reconciliation_required`; expose an explicit
kind-specific state rather than collapse uncertainty into failed or running.

Support state/kind/session filters and stable keyset pagination with a documented
tie-breaker and invalid-cursor response. A task completing between page reads
must not corrupt navigation. Document partial-read failures so the frontend does
not label an incomplete inventory empty. Include API-created tasks in the same
authorized inventory, even when they have no session.

Define saved-history access after key revocation/expiration/model-grant changes.
Historical reads should use current dashboard permission to the saved record,
not revive inference authority or depend on an active API-key secret. If some
reads remain forbidden, return an explicit documented refusal. Upstream refresh
remains a separate authorized action and retains the original account binding.
Revoked credentials must not gain dispatch or refresh rights through history.

### P2: Artifacts inventory

Expose an authorized projection of actual outputs linked to their source task,
optional session/turn, workspace, kind, creation time, content type, meaningful
name and availability. Include duration, dimensions or size only when actually
known. Generated outputs and reusable Provider reference assets are distinct;
do not merge the `media.assets` inventory into Artifacts or assume that a result
has reference-generation permission.

Video and last frame can be two output records belonging to the same task.
Use stable output references and server-authorized preview/download endpoints.
Never return Provider URLs, credentials or asset URIs. Distinguish available,
expired, deleted, missing and temporarily unavailable where the backend has
evidence; retain existing coarse availability where it cannot distinguish them.
A task's success must not imply that its bytes remain available.

Artifact deletion must preserve task status, original request identity, billing
and diagnostics. Session archival/deletion must not silently delete task evidence
or financial records. Document retention for instructions, outputs and task
history separately; this extension does not imply permanent media storage.

### P3: workspace-scoped Provider modules and shared platform capabilities

Provider-specific modules call shared platform capabilities; the platform does
not orchestrate their private concepts. A Volcengine module owns its groups,
person materials, verification and channel-specific API flow. It can pass an
authorized reference into the current composer, associate an existing accepted
task with a platform turn, and publish an existing result reference for shared
artifact presentation. The platform supplies session/task/artifact capabilities
and authorization, without interpreting Volcengine group or verification states.
Keep these module-to-platform calls typed and explicit. Navigation preserves the
origin session/draft; closing a module performs no submission. Accept only
server-owned scoped references, not client assertions of success or output URLs.

Do not create a universal Person or human-verification entity. Volcengine person
materials and certification stay entirely in the Provider module and are not
promised reusable across platforms. General original-file storage remains a
separate optional platform facility; it does not normalize Provider registries.

Provider resources belong to an authorized workspace, never to the customer-facing
Supplier directory. Primary entry: **Workspace → Provider capabilities → Volcengine**,
with Materials and Human verification sections. Generations offers a contextual
shortcut carrying the selected workspace, model and return draft. Admin → Suppliers
continues to manage supply configuration and credentials; it is not a customer
material library or biometric workflow.

The server derives workspace scope from the authenticated principal and verifies
membership and model access on every list, detail, link, mutation and reference
resolution. Sharing one upstream account must not expose that account's complete
inventory. Return only resources recorded as owned by the current workspace;
foreign resources are excluded from lists and inaccessible by guessed identifiers.
Within a workspace, sharing follows member permissions rather than implicit
per-user ownership. Provider-side isolation is additional protection, not a
prerequisite or replacement for Niu authorization.

| Resource | Owner and placement |
| --- | --- |
| Original file | Existing workspace material library, if needed; independent of Provider registration. |
| Provider material/group | Workspace-scoped Volcengine module; retain its native concepts and actual states. |
| Person material/verification | Workspace-scoped Volcengine module only; no universal Person entity. |
| Accepted generation task | Shared platform task capability, associated with its workspace/session. |
| Generated artifact | Shared platform output capability with authorized retrieval and retention state. |

Keep a Niu material identity independent of opaque Provider identifiers. A material
may have several registrations; registration does not replace its original file.
Bind each registration and person-verification record to the authorized workspace,
selected Provider adapter, upstream account/credential configuration, channel and
applicable model/schema identity. Display meaningful Supplier/Provider names and
channel restrictions: Provider identity need not be hidden. Credentials, private
tokens, raw asset URIs and internal references remain private adapter details.

The existing implementation pins exact credential/model bindings and records the
original key for immutable history/encryption. Current key grants and routing are
revalidated. Do not equate a Niu inference key with the upstream account, and do
not assume all credentials for one Supplier identify the same account. Same-account
key replacement or cross-model reuse requires documented proof and a supported
rebinding contract; never bypass current binding checks or rewrite immutable rows.

Artifact byte retention needs a separate bounded capture/promotion contract. Current
Video result references and availability do not guarantee durable copied bytes.
Capture must use authorized result retrieval, bounded format/size/quota checks,
durable status and deduplicated source identity. A failed capture cannot be labelled
available or trigger regeneration. Keep supplier URL expiry separate from retained
bytes; deletion and storage policy must be explicit. Existing material limits still
apply until deliberately extended. Do not make public Provider-upload URLs from
authenticated library downloads by assumption.

### P4: minimum human-verification entry and recovery

Primary entry: **Workspace → Provider capabilities → Volcengine → Human verification**.
Secondary entry: a contextual action beside selected person/reference inputs in
Generations when the chosen model/channel actually requires it. Restore the
original draft after returning; switching a model preserves materials and outputs
but recomputes compatibility and binding requirements. No extra rail item or
Admin-only biometric workflow is required.

The module reuses `client.media.verification` and existing workspace Provider
groups. It does not require Collections or a general Person destination. Model
discovery must identify supported Provider modules and expose their safe named
context; do not infer capability solely from a model alias. Ordinary text generation
must not acquire a face gate. The dashboard needs session-authenticated access to
these existing scoped operations without exposing or asking for inference secrets.

1. The authorized user explicitly starts a session for the selected account/model
   context. Persist its idempotency identity and optional subject label; creation
   is not verification and an uncertain creation must not automatically repeat.
2. Retrieve the private H5 link deliberately, then open it for the person to
   complete on the Provider's site. Niu does not collect biometric video or
   substitute a local detector. Never place the link/token in ordinary metadata,
   Logs, telemetry, shared session exports or browser storage. Use no-referrer
   navigation and respect known expiry.
3. Return navigation or window closure changes no verification state. The user
   explicitly checks the saved session. Existing refresh can resolve/create a
   person group upstream, so preserve its durable query claim and uncertainty
   protections; do not implement unconditional polling or treat it as a GET.
4. Only a genuine decoded verified result binds the returned Niu person-group
   reference to the product subject/context. Multiple materials may reference the
   same confirmed person binding where the channel supports it. A label alone
   does not prove that files depict that person.
5. Each material registration retains its independent processing/Active state.
   Verified person, ready group and Active material are distinct conditions.
   No one status promotes another or guarantees generation permission.

Render the existing verification states (`prepared`, `unknown`, `not_sent`,
`waiting_user`, `processing`, `verified`, `failed`, `expired`) without fake
completion. Expired or uncertain sessions retain their historical association;
starting another is a separate explicit action. Reuse stored server session data
across restart and browser loss, and preserve authorization when changing keys.

Deliver a session-authenticated dashboard bridge or documented authorized SDK
access for the minimum entry. Do not require users to paste upstream secrets or
retrieve/store inference-key secrets just to open this feature. Add any required
Provider-local material/session associations, capability discovery and safe named context
DTOs through additive contracts, with no blanket permission to migrate bindings.

See [material library](workspace-material-library.md),
[FastRouter integration](fastrouter-video-integration.md),
[Provider group acceptance](provider-asset-group-acceptance.md),
[Provider asset acceptance](provider-video-asset-acceptance.md),
[verification creation](provider-verification-session-create-acceptance.md) and
[verification expiry/rotation](provider-verification-encryption-rotation-acceptance.md).
These establish scoped building blocks, not successful human verification or a
complete reusable-person generation journey.

## API and SDK delivery

Choose additive route names consistent with current scoped dashboard APIs;
publish the final paths rather than implement these prose names literally.
Deliver session list/detail, turn append/association, task list/detail and output
list/detail projections through typed SDK methods, generated handler OpenAPI,
documentation-site reference pages and bounded examples.

Keep existing `/v1/video/jobs` APIs, key-scoped dashboard routes, Video intent
contracts and saved links compatible. Do not expose unimplemented cancellation,
webhooks, percent progress or automatic retry controls. A saved-state GET remains
side-effect-free; explicit status refresh queries an existing task and cannot
submit another generation. Customer fields contain customer charges only.

## Acceptance to return to the frontend

1. Existing Chat and Video records remain readable after migration and restart.
   A real already-generated video retains its state and available result.
2. Two fixture Video tasks attach to successive turns in one session; reload,
   second browser and cleared browser storage restore the same ordering.
3. A lost submission/association response recovers the original task; concurrent
   writes conflict explicitly and no route issues duplicate inference.
4. Tasks includes authorized API-created jobs without fabricating a session;
   state filtering, pagination and key lifecycle follow the documented policy.
5. Artifacts retrieves existing authorized video/last-frame bytes and represents
   expired/deleted/unavailable outputs honestly; no new generation occurs.
6. Ordinary roles, actor-private sessions, cross-workspace access and revoked-key
   historical reads have explicit positive/negative coverage. No customer route
   returns procurement fields, private Provider references or credentials.
7. Return implemented paths/types, migration and SDK revisions, test evidence,
   compatibility notes and any remaining limitations. Provide local read-only
   verification instructions through private configuration, without embedding
   test credentials, customer records or machine paths in this public document.
8. Asset promotion stores available original output bytes/provenance once, survives
   restart, enforces quotas and handles expiry/failure without new generation.
   Provider registration remains separate from original-file ownership and stays workspace-scoped.
9. Fixture human-verification flows cover waiting, processing, verified person-group
   association, expiry and unknown query recovery, with independent asset Active
   checks and account/channel isolation. Existing genuine expired-session reads
   verify honest expiry; actual human completion remains a separate user-performed
   qualification and must never be manufactured or inferred from redirects.

## Frontend work that does not require these extensions

Use Stitch and the established conversation reference to remove Video's parallel
input/result layout. Show retained instruction followed by saved task state and
available output in one timeline; keep settings beside the composer and diagnosis
secondary. Do not pretend a single intent supports persistent multi-turn Video.
Workspace Provider modules need session-authenticated scoped access and model capability discovery before the page flow can read real records. Admin Supplier configuration is a separate entry and must not substitute for this customer workflow.
Tasks and Artifacts navigation waits for its inventory contract; no empty placeholder
destinations or browser-only indexes should stand in for the backend work above.

## Implemented frontend review flow

- `/workspaces/:workspace/provider-capabilities/volcengine` contains Provider-native Materials and Human verification sections. Materials uses Groups and Materials tabs.
- The Video composer opens the same module in a dialog without navigating away or unmounting its draft. Closing restores the composer.
- New material group and verification forms expose their intended context and name fields. Submission is disabled until session-authenticated integration is supplied. No generation, registration or verification call is issued by this review implementation.
- Missing integration is represented as unavailable records, never an empty successful inventory or invented verification state. This is a review flow, not completed backend integration.
- Replace the temporary fixed module entry with server-discovered authorized capabilities. The selected generation model is context, not proof that Volcengine capabilities are supported.
- Supply workspace-scoped group/material/session inventory, safe display context, compatible reference resolution and the module-to-platform associations described above. Preserve the current workspace member authorization boundary.
