# Durable Chat SDK frontend handoff

This guide hands off the backend contracts for S09-3. Browser adoption and rendered interactions belong to frontend acceptance; this document does not mark them verified. The backend is authoritative for saved conversations and drafts. Browser memory or storage can cache them, but clearing that cache must not delete or replace backend content.

Use `NiuAdminClient` from `@niu-io/sdk` with an authenticated management/member context, not an inference API key. In a cookie-authenticated browser, use the established same-origin session transport and Origin protections. Never embed an installation administrator secret in frontend code. Scope uses `organizationId` and legacy `projectId`; describe the latter as a workspace in the product.

## Load and restore

| SDK operation | Contract |
| --- | --- |
| `listChatSessionPage(scope, {limit, after, archived})` | Returns `{data,next_cursor}`; limit 1–100, cursor opaque. Keep the archive filter across pages. |
| `getChatSession(scope, sessionRef)` | Returns the complete `{data,archived,revision,guardedWrites}` even outside the latest-100 history. |
| `saveChatSessionIfCurrent(scope, sessionRef, body, expectedRevision)` | Guarded creation with null; guarded update with the revision of the actual read body. |
| `setChatSessionArchived(scope, sessionRef, archived)` | Explicit archive action; advances the content revision. Reload before another content save. |
| `deleteChatSession(scope, sessionRef)` | Explicit deletion; stale compatibility saves cannot resurrect guarded conversations. |
| `exportChatSession(scope, sessionRef)` | Portable content without internal IDs, errors or accounting. |

History paging is a live view. On cursor 409, restart from the first page and deduplicate by routing reference; do not interpret it as an empty history. Direct detail and history are personal-owner scoped within the workspace. UUIDs remain internal routing references and must not become display labels.

Keep `revision` as an opaque decimal string. Preserve complete `turns`, results, attachments and settings when editing a conversation. Renaming must not rebuild its body from the last turn. Saved charge fields are not authoritative: the Gateway hydrates customer charges from matching native attempts; unknown references remain unknown.

## Guarded save and explicit conflict resolution

```ts
import { NiuAPIError } from '@niu-io/sdk';

// admin, scope and sessionRef come from the authenticated application context.
const base = await admin.getChatSession(scope, sessionRef);
const edited = structuredClone(base.data); // retain all turns/settings/attachments
edited.title = requestedTitle;

try {
  const saved = await admin.saveChatSessionIfCurrent(
    scope, sessionRef, edited, base.revision,
  );
  // Store saved.revision with this confirmed body; replace disposable caches.
} catch (error) {
  if (!(error instanceof NiuAPIError) || error.status !== 409) throw error;
  const latest = await admin.getChatSession(scope, sessionRef);
  // Keep edited separately and present latest to the user. Stop here.
  // Only after explicit reconciliation/confirmation, derive a new full body
  // from latest.data plus the chosen edit and save against latest.revision.
}
```

Do not replace the expected revision and silently resubmit the stale whole body. Serialize autosaves per resource, and stop a queued stale save after conflict, deletion, workspace switch or logout. A timeout, aborted request, lost response, or SDK error saying protection was not confirmed can mean a save occurred: retain the pending edit, reload, and ask for an explicit retry if reconciliation is still needed. A 503 is unavailable storage, never an empty-success replacement. Do not use compatibility `saveChatSession` for new frontend writers.

New conversations use `saveChatSessionIfCurrent(..., null)`. After a deleted reference is intentionally recreated, use null and the returned new revision; never reuse a pre-deletion revision. Archive and delete remain explicit action semantics, not compare-and-swap APIs.

## Draft, settings and attachments

The owner has one draft per workspace, separate from saved conversation content. At this source review, `NiuAdminClient` does not expose typed draft methods; the native contract below is implemented, but adding and adopting those helpers remains a specific SDK handoff gap. Do not replace it with browser-only draft persistence. Native GET and PUT use `/admin/v1/organizations/{organization}/projects/{project}/chat-draft`.

GET returns `{data:{payload,revision}}`; a never-saved draft has null payload and revision zero. PUT accepts `{expected_revision,payload}` and returns the saved payload with its new numeric revision. A clear is `payload:null` with the last read revision; clearing retains revision protection. A stale PUT returns 409 without replacing the newer draft. Use the same reload, retain-edit and explicit-reconcile workflow as conversation saves; never initialize revision zero merely because the browser cache is empty.

A non-null payload contains `sessionId` (owned saved reference or null), `prompt`, `models`, `attachments`, and `settings`. Settings require `systemPrompt`, `maxTokens`, `temperature`, and `logPayloads`; attachments contain `name`, `type` (`text` or `image`) and `content`. Draft references must resolve to the same owner's saved conversation. The API accepts at most four distinct models and four attachments; prompt/system prompt each have 12,000-character bounds, attachment content six-MiB bounds, and temperature is 0–2. These persistence contracts do not imply image inspection or new model-input capabilities.

Follow-up inference is separate: supply the chosen branch's completed prior turns to the inference request. `chatBranchMessages(turns, model)` reconstructs completed text exchanges for one model branch; it does not automatically send a request or assemble attachment interpretation. Saving or deleting Chat content does not alter immutable request billing.

## Evidence and remaining acceptance

The [guarded-write checkpoint](chat-session-write-guards.md) exercised genuine retained two-turn content, concurrent saves, stale rejection, deletion/recreation, compiled SDK protected writes and independent native verification without new inference. The [backend checkpoint](chat-backend-acceptance.md) exercised populated history/detail, settings, real report attachments, draft save/conflict/clear, archive/delete, restart and scope isolation. The [paging contract](chat-history-pagination.md) records executed compiled SDK continuation over actual populated history.

Those are their recorded historical runtime and SDK pins, not a claim that this handoff executed every helper on the newest deployment. Frontend ownership must adopt guarded writes, restore from the backend, retain edits across conflict, require explicit reconciliation, and browser-verify desktop/narrow interactions and cache clearing. No fixture outcome supports these acceptance claims.
