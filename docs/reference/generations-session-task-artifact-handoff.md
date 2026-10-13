# Generations: sessions, tasks and artifacts — backend handoff

Status: proposed implementation contract. Existing Video APIs remain authoritative;
the extensions below are not implemented or advertised as available. Reviewed
2026-10-13 against `6cd4d511` and the new Video API/SDK documentation.

## Outcome

Generations has one conversation experience for Chat and Video. A user submits
an instruction, sees its execution state in the same timeline, and views the
result there. Subsequent instructions create new turns in that saved session.
Tasks and Artifacts are first-level views inside Generations, not new product
rail areas. Tasks finds executions across sessions; Artifacts finds outputs.
Neither is an agent orchestration service.

This work must use existing generated videos for integration acceptance. Do not
call generation, replay creation, create reference assets or start verification
sessions to obtain new test data. Read saved status and available result bytes.
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

## Frontend work that does not require these extensions

Use Stitch and the established conversation reference to remove Video's parallel
input/result layout. Show retained instruction followed by saved task state and
available output in one timeline; keep settings beside the composer and diagnosis
secondary. Do not pretend a single intent supports persistent multi-turn Video.
Supplier model configuration can gain an explicit entry through existing APIs.
Tasks and Artifacts navigation waits for its inventory contract; no empty placeholder
destinations or browser-only indexes should stand in for the backend work above.
