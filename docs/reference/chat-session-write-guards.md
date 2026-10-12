# Atomic saved Chat writes

Current-input checkpoint on runtime `7234a4ef`, schema 0282, reviewed 2026-10-12.
Fixture outcomes provide no evidence. This protects enabled saved resources;
untouched compatibility resources and complete frontend adoption remain separate.

## Read and save contract

Direct `GET .../chat-sessions/{id}` returns
`{data, archived, revision, guardedWrites}` with `Cache-Control: no-store`.
Treat the positive decimal `revision` string as opaque. Do not increment it,
convert it to a JavaScript number or display it as a product identifier.

`PUT .../chat-sessions/{id}` accepts optional `expectedRevision`:

| Input | Behavior |
| --- | --- |
| Omitted | Compatibility save, allowed only for references that have not enabled protection |
| Explicit null | Create only if the owned conversation is absent; enables protection |
| Positive canonical decimal string | Atomically update only that owned revision; enables protection |

A confirmed guarded response contains
`{saved: true, revision, guardedWrites: true}`. A failed precondition returns 409
without replacing content. Invalid revision types, leading zeros, nonpositive
values or values outside signed 64-bit range return 400. Scoped authorization
continues to apply before writing. A bounded storage wait returns sanitized 503.

```ts
// New conversation: explicit creation intent.
await admin.saveChatSessionIfCurrent(scope, conversationRef, initialContent, null);

// Existing conversation: use the version of the content you actually read.
const current = await admin.getChatSession(scope, conversationRef);
await admin.saveChatSessionIfCurrent(
  scope, conversationRef,
  { ...current.data, title: requestedTitle },
  current.revision,
);
```

On 409, retain the user's unsaved change, reload and reconcile it with current
content. Do not blindly retry an old whole-conversation body with a fresh revision.
The SDK validates the expected revision and requires explicit server confirmation.
An older Gateway may accept the save while omitting protection confirmation;
the SDK reports an unconfirmed outcome and says a save may have occurred. Reload
before retrying and deploy a supporting Gateway. It does not claim protected
success from a compatibility `{saved:true}` response.

## Persistent protection and deletion

A successful guarded write enables protection on that owner/workspace/reference.
Subsequent version-free content saves return 409, even if the caller supplies a
false protection flag; content cannot downgrade the mode. Untouched legacy rows
keep the previous compatibility behavior until their first guarded save.

Archive changes advance the revision, so a content save read before an archive
change must refresh. Save does not implicitly unarchive content. Revisions come
from a separate sequence and are not reused when API deletion is followed by
explicit recreation.

Deletion removes the conversation body. A content-free guard identity remains,
so an old compatibility autosave cannot resurrect it. Explicit null guarded
creation may recreate that reference with a fresh revision. The retained identity
contains scope/owner/reference only, with no prompt, response or attachment.
When an otherwise empty workspace is explicitly deleted, these identities are
removed with it; [current cleanup evidence](chat-guard-scope-cleanup.md) checks
that content/request/accounting records retain their deletion restrictions.
Archive/delete APIs retain their explicit action semantics; they are not newly
guarded archive/delete operations.

## Actual diagnosis and verification

The preceding executable stored a real two-turn model conversation, then accepted
a stale one-turn rename with HTTP 200. Independent native state confirmed that
the second actual turn disappeared. During implementation, mixed guarded/legacy
saves and a delayed legacy save after deletion also reproduced the overwrite
and resurrection gaps. They were corrected before this checkpoint was published.

The final current-input run copied that stopped actual history and upgraded
schema 0279 through 0282. Existing saved payload/ownership/archive/timestamps
remained unchanged. An ordinary owner used the original real model responses;
no model was called and no accounting entry was fabricated.

- Guarded creation succeeded; duplicate creation conflicted. Invalid revisions
  were rejected before mutation.
- The actual second turn survived a stale rename, which returned 409.
- Two simultaneous saves with one read revision produced one 200 and one 409.
- Archive advanced the revision; an old content version conflicted.
- Deleted and pre-recreation versions failed; explicit recreation used a newer
  revision, preserving the two actual turns.
- Compatibility overwrite and deleted-reference resurrection were rejected.
  A separate untouched legacy row retained compatibility until explicit opt-in,
  after which compatibility writes were rejected across restart.
- The clean-built SDK saved with a read revision and surfaced stale conflict.
  An actual retained older Gateway confirmed the SDK's unconfirmed-state behavior.
- A held session-table lock returned sanitized 503 in **253.97 ms**; release
  preserved content/version. Restart and operator revocation were verified.

Separate processes reopened source and final databases. They confirmed the
original lost-turn state, preserved migration payloads, final real two-turn
content and authoritative charges, persisted protection and guard identities,
non-reused revisions, conflict artifacts, native lock diagnostics and revocation.
Complete request/financial fingerprints matched the source. No new inference,
funding receipt or customer/Supplier financial entry occurred. The older-server
mutation was independently confirmed; the SDK reported uncertainty correctly.

The original installation was backed up and restored independently before each
native update. Saved rows/revisions, encrypted identities and configuration were
preserved; guard backfill and authenticated registry matching were checked. Raw
content and credentials remain outside Git.

## Remaining scope

Frontend clients must adopt guarded saves to protect previously untouched legacy
resources. This does not establish every writer/version mixture, guarded
archive/delete semantics, large-content write throughput, production capacity
or complete Chat/release readiness. Customer charging remains a separate immutable
ledger operation and is unaffected by conversation rename/delete.
