# Generations: sessions, tasks and artifacts — backend handoff

Status: implementation contract with an additive backend increment delivered. Existing Video APIs remain authoritative. The [implemented API/SDK guide](../../apps/docs/src/content/docs/reference/generations.mdx) records exact paths, verification and limitations. Reviewed 2026-10-13.

## Current handoff: resume here (2026-10-13)

**The implementation is not complete.** The latest local increment adds dashboard
media access and explicit result re-fetching. Task execution-context projection,
SDK normalization and correct model-specific tool discovery are still pending.
The local implementation is included in the implementation handoff commit following
the documentation-only commit `45a129eb`. Pull the latest `main` to obtain both code
and this document. This is a continuation checkpoint, not release acceptance;
remaining work below is still outstanding.

### Next work, in order

1. **Make saved task identity authoritative.** Every generation must retain its
   dispatched model, Provider adapter, channel and upstream account binding, plus
   the validated inputs/parameters permitted by retention policy. Existing
   `media_recovery_routes` already pins dispatch identity and refresh uses it:
   preserve this implementation rather than introducing another routing engine.
   Expose a customer-safe execution-context projection in task detail and the SDK.
   The current `GenerationTask` exposes model but not this execution context.
   Distinguish submitted model alias from actual dispatched model. Missing historic
   information stays unknown; never reconstruct it from current composer choices
   or today's Supplier configuration. Do not expose credentials, private upstream
   IDs/URLs, internal account IDs or procurement data.
2. **Normalize status and result operations in the SDK.** Callers provide the
   authorized task reference and output kind. The server loads the saved binding
   and selects the adapter; clients must not supply a replacement Provider/model
   to query an existing task. Keep saved reads, explicit upstream status refresh,
   cached content delivery and explicit fresh-result delivery distinct. Existing
   selected-key APIs remain compatible; document their current-grant requirements
   separately from cross-key historical inventory reads. Add a typed SDK method
   for the new dashboard result-refresh endpoint and session-authenticated media
   access; the frontend currently uses custom fetch senders for these additions.
   Publish matching OpenAPI and docs. Do not silently add auto-retry or generation.
3. **Gate native tools by declared capabilities.** `VideoView.tsx` currently opens
   `VolcengineView` from an unconditional “Supplier tools” action. This incorrectly
   offers Seedance-specific tools for an OpenRouter Grok task. Return authorized
   model/channel module capabilities, and use them for contextual tools, workspace
   Video discovery and family choices. `useMaterials.ts` currently probes active
   keys/models and takes the first supported binding; replace that fallback with
   explicit authorized context. Never mix inventories across upstream accounts or
   infer native capability from a model name or generic video support.
4. **Verify the correct existing FastRouter Seedance task.** Locate its saved
   record and existing result in the test environment. Verify the actual saved
   channel, then exercise status and output retrieval without submitting again.
   Keep OpenRouter Grok and FastRouter Seedance evidence separate. The local
   successful-task/HTTP-410 download check below was OpenRouter Grok, and proves
   nothing about FastRouter output availability. The FastRouter recovery check
   remains outstanding. Copy only necessary scoped test data through private
   configuration; do not replace the local database or publish credentials.
5. **Finish acceptance, then shared output presentation.** Test authorization,
   original-route recovery, result expiry semantics and SDK contracts first. Wire
   Tasks/Assets to the delivered inventory and show source-task context. Native
   materials/groups remain workspace-scoped module resources, not generated
   outputs. Durable byte capture/promotion remains separate unfinished work.

### Local increment: files and verification boundaries

| Change | Implementation | Verification / remaining work |
| --- | --- | --- |
| Dashboard media routes | `apps/gateway/src/web/media_authorization.rs`, `provider_assets.rs`, `provider_verification.rs`, `routes.rs`; session-authorized selected-key access to existing native handlers | Build/check passed earlier in this increment; actual group/session reads returned 200 and empty inventories; invalid authentication was denied. Full role/cross-workspace regression coverage remains pending. |
| Materials and verification UI | `apps/dashboard/src/features/provider-modules/volcengine/useMaterials.ts`, `VolcengineView.tsx`, `page.tsx`; group menu/dialog, URL registration, explicit verification actions | Desktop menu/dialog and empty reads inspected. No upstream group/material/session creation or completed face verification was performed. Narrow-screen and mutation-recovery acceptance remain pending. |
| Explicit fresh result delivery | `apps/gateway/src/web/inference/{dashboard_video,video,video_results}.rs`, `web/routes.rs`; frontend `VideoResult.tsx` and `result.ts` | Earlier endpoint build passed; nine targeted `VideoResult` tests passed. Existing OpenRouter task query succeeded, download returned 410. Latest error mapping passes gateway cargo check; final runtime verification and positive FastRouter delivery remain unverified. |
| SDK and task metadata | Existing `sdks/javascript/src/admin.ts`, `generations-inventory.ts`, storage `generations_inventory.sql` | The new execution-context projection and typed refresh/media additions have **not** been implemented. Do not treat the requested design as delivered code. |

Checkpoint validation: dashboard TypeScript check, gateway `cargo check`, and
58 targeted tests across seven Video, Generations and route-fallback test files
passed. This does not replace browser acceptance or upstream recovery verification.

The earlier broader dashboard test run had failures in concurrent layout/activity work;
it is not a passing release acceptance. Re-run relevant checks after integrating
all changes. No paid generation is authorized for this handoff.

| Area | Delivery state |
| --- | --- |
| P0 Video sessions and turn/task associations | Implemented; actual existing-task association, concurrency, deletion, archive and restart exercised |
| P0 common typed Chat/Video read projection | Implemented; retained Chat instruction restored through the compatible bridge; positive execution-linked Chat branch recovery unverified |
| P1 historical task inventory | Implemented for Video across saved keys, with exact states and actor privacy; complete text-execution inventory remains open |
| P2 generated-output inventory | Implemented for video and last frame; actual expired outputs refuse download; positive unexpired delivery remains unverified in this increment |
| General retained Video controls/references | New turns retain typed text instructions only; the original Video intent remains authoritative for validated submission input |
| P3 workspace-scoped Provider modules and shared platform capabilities | Existing inference-key media SDK and workspace isolation are implemented; dashboard selected-key access is implemented; module discovery and shared asset bindings remain pending; no universal Person entity |
| P4 human verification | Existing inference-key session operations are implemented; workspace forms now call existing session operations; completed human verification remains unverified |
| Frontend timeline and two-browser rendering | Frontend integration and acceptance remain open |

This status does not mark all acceptance items complete. No fixture result supports these delivery claims, and no paid generation was initiated for this increment.

## Outcome

Generations has one conversation experience for Chat and Video. A user submits
an instruction, sees its execution state in the same timeline, and views the
result there. Subsequent instructions create new turns in that saved session.
Tasks remains a view of executions across sessions. Assets is now requested as a
top-level product area for generated outputs; the existing artifacts API is its
read contract, not a requirement to rename storage or duplicate execution state.
Neither is an agent orchestration service.

This work must use existing generated videos for integration acceptance. Do not
call generation or replay creation to obtain new test data. Read saved status
and available result bytes. Do not create reference assets or verification
sessions solely for acceptance; the human-verification entry is a separately
explicit user action, not an automatic step in viewing a video.
If a cached download reference has expired, report that specific state; do not
infer that the upstream resource has expired. An explicit query may obtain a fresh
reference from the original task, without regeneration. Use
fixtures for creation/concurrency failure tests, not paid upstream operations.

## Existing capabilities to retain

| Existing surface | Coverage | Remaining gap |
| --- | --- | --- |
| Video jobs: create, retrieve, list, refresh, wait | Durable task state, original dispatch identity and recovery | Key-scoped compatibility APIs remain; the delivered generations session/task inventory adds actor-scoped associations and history across saved keys. |
| Video results: availability and binary retrieval | Authorized video/last-frame preview and download, separate expiry/deletion | Delivered generations artifacts inventory indexes Video and last-frame outputs; durable byte capture remains separate. |
| Video billing, observations and timings | Customer-safe task diagnosis | Must remain linked to the task, independently of retained output. |
| Dashboard key-scoped Video bridge | Reuses saved jobs and selected-key authorization | Frontend must enumerate keys and cannot treat active-key discovery as a complete historical inventory. |
| Video submission intents | Actor-owned saved text input, optimistic revision and no-resend restoration | A single intent is not a multi-turn session. It expires; references are not a general saved conversation format. |
| Chat sessions and drafts | Actor-scoped durable multi-turn Chat and optimistic revisions | Current payload is a text-comparison contract, not a typed asynchronous timeline. |
| Supplier model mappings and Video schemas | Model-declared channels, inputs and controls | Frontend discoverability work; no replacement backend capability editor is required. |
| Workspace material library | Durable encrypted original files, metadata, scoped member CRUD, SDK and quota enforcement | No Collections, person entity, Artifact-to-Asset promotion or general audio/video reference dispatch. |
| Provider asset groups, assets and operations | Account/model-bound resources, acknowledged creation, processing/Active state and recovery | Not a generic material library; no unified material-to-Provider binding projection. |
| Provider verification sessions | Create/list/read, explicit private H5 link, guarded result query and genuine person-group binding | No person-library association; dashboard entry is wired in the local increment, but actual human completion remains unverified. |

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
Supplier directory. Primary entry: **Workspace → Video → Volcengine**,
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
| Person material/verification | Workspace-scoped Volcengine module only; no universal Person entity. Seedance remains the model family, not a Provider. |
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

Primary entry: **Workspace → Video → Volcengine → Human verification**.
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

Dashboard media access now reuses session-authorized workspace keys under
`/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/media/*`. Do not require users to paste upstream secrets or
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

## Implemented frontend flow

- `/workspaces/:workspace/video/volcengine` uses one horizontal tab row for Materials and Human verification. Materials uses a group DropdownMenu and the selected group’s files; the workspace sidebar contains only Video, with no child navigation. The legacy provider-capabilities route redirects here. Video visibility currently uses authorized video model discovery through active workspace key metadata and session-authenticated model reads. This discovers Video availability, not Volcengine-specific support; the backend capability contract must distinguish Provider modules.
- The Video composer opens the same module in a dialog without navigating away or unmounting its draft. Closing restores the composer.
- Group creation/editing, URL material registration and human verification creation call the existing media SDK operations through dashboard selected-key routes. Mutations require workspace write permission. Verification links and status checks are explicit actions; page loading performs only saved-state reads.
- Live local reads for groups and verification sessions return 200, with empty saved inventories in the current workspace. Invalid authentication returns 401. Upstream mutations and completed human verification were not exercised in this pass; no generation was submitted. Product errors replace the empty state and offer Retry.
- Replace the temporary fixed module entry with server-discovered authorized capabilities. The selected generation model is context, not proof that Volcengine capabilities are supported.
- Supply workspace-scoped group/material/session inventory, safe display context, compatible reference resolution and the module-to-platform associations described above. Preserve the current workspace member authorization boundary.

### Video frontend information hierarchy

The Video management canvas is fluid and has no fixed maximum page width. Only Generations chat retains a readable column width. The top-right choice is the model family (currently Seedance), not the Supplier or Provider. Provider-specific binding and credential/channel isolation remain authoritative when resolving groups, material references and verification sessions. Materials uses a group DropdownMenu and files in one tab; New group and Edit group open dialogs, with no persistent folder tree; Human verification is the other tab. Do not expose implementation pending notices in product UI.

### Next frontend scope: top-level Assets

After the Video management flow, design a top-level Assets area for generated outputs. It must consume shared authorized output/task capabilities rather than provider-native material registries. Define the screen flow before implementing the backend inventory contract. Do not add an empty navigation destination or fabricate persisted outputs. Preserve source task/session associations, result availability, retrieval authorization, expiry and retention semantics. This requested placement updates the earlier assumption that generated artifacts are only reachable inside Generations.

## API alignment review after backend synchronization — 2026-10-13

Reviewed the delivered gateway route registrations, session/inventory handlers,
JavaScript SDK and `generations.mdx`. This is a source/contract review, not a new
runtime or paid-generation acceptance run.

### Reuse delivered contracts

- Session-authenticated workspace `/generations-sessions` reads/writes and turn/task
  association match the module-to-platform direction. Module callers attach an
  existing accepted task; these operations do not submit or replay generation.
- `/generations/tasks` and `/generations/artifacts` list historical Video work
  across saved keys, including expired/revoked keys, with workspace Read and actor
  privacy checks. SDK `admin.generations(scope)` already exposes these reads.
  Use the artifacts contract for top-level Assets; no duplicate inventory is needed.
- Artifact detail/content preserves availability, bounded delivery, private
  upstream URLs and account/model binding checks. Do not interpret `available`
  as proof that bytes were durably copied or are still downloadable.
- Existing `/v1/media/asset-groups`, `/v1/media/assets` and verification sessions
  provide native scoped operations. Asset listing already supports `group_id`,
  which fits the group dropdown and selected group's files. Keep these contracts
  compatible rather than invent a universal Person domain.

### Required additive integration

1. **Dashboard media authorization — implemented:** the selected-key routes reuse
   `authorize_dashboard_key` and the existing native media handlers. GET requires
   Read; mutations and explicit refresh require Write. Existing model grants,
   workspace isolation and Provider account binding checks still apply. The stored
   Supplier credential stays on the server. Neither a Supplier login nor another
   user-supplied key is needed. Broader role/isolation regression acceptance remains
   required before release.
2. **Capability and model context discovery:** the Video model list describes
   inputs/controls, but does not declare Seedance family, available native modules
   or safe Provider/account/channel context. Add an authorized discovery projection
   for dynamic sidebar visibility and the top-right family choice. Seedance is a
   model family; Volcengine is one Provider. Family selection alone must never
   choose a credential or combine different Provider registries. Show only actual
   supported families/contexts; preserve immutable resource bindings.
3. **Group menu/dialog flow:** return safe names, revisions, group kind and state;
   create/edit return recoverable operation/resource references. Edit is disabled
   without a selected group. Preserve existing idempotency and optimistic revision
   handling; person groups come from the genuine verification flow, not ordinary
   group creation. Unknown mutation outcomes must not auto-repeat.
4. **Material admission:** the current native create contract takes a URL, kind and
   group reference; it does not itself upload local bytes or provide a browser
   preview. Document supported safe source admission and authorized preview
   retrieval for Add material. If uploads are supported, use bounded server-owned
   sources or workspace file references, not assumed public authenticated-file URLs.
   Keep Provider registration/processing independent from original-file ownership.
5. **Verification flow:** preserve deliberate private H5 link retrieval, expiry
   and explicit result check. Refresh is POST and may resolve/create a person group;
   do not implement passive GET polling or mark verified from navigation alone.
6. **Draft references:** new session turns currently retain only typed video prompt
   text. Selected group/material references and model controls require a documented
   saved draft/input association if they must survive browser loss. Keep the
   existing validated submission intent authoritative; no browser-only persistence
   or assertion that an attached old task used a newly edited prompt.

### Limits relevant to top-level Assets

The delivered output inventory supports Video and last-frame only. Content type
is null until retrieval inspects bytes; frontend must not invent MIME, dimensions,
thumbnail availability or a successful preview. Unexpired positive retrieval and
two-browser frontend acceptance remain unverified in the backend delivery report.
No output deletion, rename, capture or promotion method is exposed by this new
SDK inventory; only add those controls when an explicit authorized contract exists.
Aggregating authorized workspace output pages can provide the initial global
Assets view, while preserving actor-private associations and failures. Do not call
generation to fill missing or expired outputs.

### Compact layout correction

The existing breadcrumb supplies the page title. Materials/Human verification tabs
and the Seedance choice share one horizontal row. Group selection and Add material
share the next toolbar. Empty content is unboxed; failures do not masquerade as
empty inventories. The layout follows the updated existing Stitch screen.

### Existing output retrieval after link expiry

The dashboard now offers an explicit `Fetch video again` action. Its POST endpoint
is the selected-key Video result path with `/refresh` appended:
`/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/results/{kind}/refresh`.
It authorizes workspace write access and conversation ownership, queries the original
Provider task, then uses its current result reference for bounded binary delivery.
It never submits a generation. Signed URLs remain private. Existing result-reference
expiry/deletion records are not rewritten; the returned bytes are a new explicit
delivery, not a claim that the old cache is available. Account/key access is checked
again after the network work. Persistent artifact capture remains separate scope.

An existing local **OpenRouter Grok** task returned HTTP 200 and `succeeded` on explicit query. This was not the FastRouter Seedance task; FastRouter result recovery remains unverified.
Cached URL expiry alone must not be presented as deletion of the upstream resource.

The subsequent OpenRouter current-result download returned upstream HTTP 410. The task
remains succeeded; the UI reports the download failure without implying that local
cache expiry itself deleted the upstream resource. No new generation was made.
