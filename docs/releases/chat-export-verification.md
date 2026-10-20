# Saved Chat export verification

Reviewed 2026-10-12. The current-input backend checkpoint below verifies the exercised ordinary-owner lifecycle; complete Chat, browser and SDK qualification remain open. Fixture outcomes provide no evidence.

`GET /admin/v1/organizations/{organization}/projects/{project}/chats/{id}/export` reads one durable conversation with workspace read authorization and the authenticated personal owner. Direct lookup supports sessions outside the latest-100 history list. Its versioned `niu-chat` JSON contains title, creation time, ordered prompts, model response content/status and attachments. Legacy single-turn sessions become one turn. Internal identifiers, generation settings, diagnostic errors, token/timing metrics and all saved accounting fields are excluded. User-supplied conversation and attachment content is deliberately exported; this is not a Logs or billing export.

Historical fixture and unit commands were executed for storage, Gateway and SDK
paths. Their outcomes provide no evidence of correctness or acceptance. The
current-input checkpoint below is the basis for the exercised backend claims.

## History menu and browser download

Chat history now offers Export beside Rename and Delete in its existing shadcn action menu. It reads the backend export rather than serializing browser history, uses a fixed `niu-chat.json` filename, cancels on scope changes/unmount and reports failures without discarding the saved conversation. Actual OpenRouter Chat room actions were inspected before implementation; Niu keeps that compact per-conversation menu pattern with its own required Export action.

At 1280px and 390px, the live menu was inspected open, including its icon gutter and alignment. The phone menu stayed within the viewport (right edge 371px, document width 390px). Desktop and phone downloads both matched the backend JSON for a task-created saved draft, which contained no model response or fabricated usage. The draft was then removed. This verifies actual backend-to-browser download for draft content; live generated multi-turn/attachment export remains unqualified.

Historical dashboard fixture commands were executed and provide no evidence.
The earlier draft downloads do not establish generated multi-turn export.

## Current ordinary-owner lifecycle — 2026-10-12

Clean backend `e1d4325` served a stopped copy of actual request history, migrated
through 0279. A new ordinary workspace owner and a separate ordinary viewer
used real management credentials; a new no-expiration workspace API key made
two actual OpenRouter `openai/gpt-4.1-mini-2025-04-14` calls. This remains personal
self-funded upstream testing with internal verification rates and approved
credit, not commercial supply, an external funding receipt or a price claim.

The first response contained a fresh conversation marker. The owner saved that
turn through the session API, then the Gateway restarted. The follow-up request
explicitly carried the actual first user/assistant history and recalled the
marker. The owner saved both turns. This verifies consumer-supplied context and
backend persistence; the backend does not automatically construct inference
history, and browser reload/context construction was not inspected here.

Saved history hydrated both results from authoritative customer charges. The
two new requests charged exactly **28,149 nanounits**; the four retained actual
requests plus these two total **145,928 nanounits**. Independent reopening checked
each response's reported usage, native usage confidence, immutable tariff
revision, charge arithmetic and aggregate matching ledger debits. No funding
receipt or unresolved balance/procurement hold existed.

The same owner archived the conversation, saved a renamed title and confirmed
it stayed archived, then restarted and retrieved identical archived history
and export. Unarchiving restored active history. Export retained both prompts,
actual response contents/statuses and renamed title, while excluding routing
IDs, token/timing diagnostics and saved accounting. Independent verification
reconstructed exported turns from the retained original response bytes and
request histories; every raw response digest matched.

The other viewer's history was empty, export returned 404 and writing returned
403. Deleting the owner's conversation survived a further restart; direct
export returned 404 and neither history contained it. Native final state
confirmed the session was absent while all six charges remained unchanged.
The temporary inference key and both operators were revoked; subsequent access
was denied. Original installation data and encrypted identity were untouched.
Raw conversation content, actor credentials and HTTP artifacts remain private.

This covers one model branch, plain text, ordinary personal ownership, archive
preservation through save/restart, export and durable deletion. It does not
qualify attachments, multi-model branch isolation, concurrent editing, histories
beyond the current list limit, every protocol, generated browser downloads or
complete Chat frontend integration. No whole-release gate is closed.
