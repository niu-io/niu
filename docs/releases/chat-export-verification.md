# Saved Chat export verification

Reviewed 2026-10-06. Backend and SDK subset verified; complete Chat lifecycle and rendered export remain open.

`GET /admin/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}/export` reads one durable conversation with workspace read authorization and the authenticated personal owner. Direct lookup supports sessions outside the latest-100 history list. Its versioned `niu-chat` JSON contains title, creation time, ordered prompts, model response content/status and attachments. Legacy single-turn sessions become one turn. Internal identifiers, generation settings, diagnostic errors, token/timing metrics and all saved accounting fields are excluded. User-supplied conversation and attachment content is deliberately exported; this is not a Logs or billing export.

Fresh PostgreSQL testing through migration 0096 passed the existing saved-Chat API test extended with export: invalid credentials are rejected; unknown and foreign-workspace sessions return not found; foreign-owner lookup returns no record; exported multi-turn attachment and model branches retain their saved content. A separate unit test verifies legacy and empty-turn fallback and omission of legacy private fields at session, response and attachment levels. Both tests passed. These checks cover storage ownership and installation-authenticated HTTP behavior; ordinary reader/writer dashboard export qualification remains open.

All 97 JavaScript SDK tests passed. The new SDK test verifies bodyless scoped GET, cancellation propagation, unchanged backend content and rejection of invalid routing identifiers before transport. Gateway/storage all-target Clippy passed with warnings denied. The root OpenAPI YAML parses with unique keys and declares the export path and content schema; this is not a complete semantic OpenAPI validator run.

## History menu and browser download

Chat history now offers Export beside Rename and Delete in its existing shadcn action menu. It reads the backend export rather than serializing browser history, uses a fixed `niu-chat.json` filename, cancels on scope changes/unmount and reports failures without discarding the saved conversation. Actual OpenRouter Chat room actions were inspected before implementation; Niu keeps that compact per-conversation menu pattern with its own required Export action.

At 1280px and 390px, the live menu was inspected open, including its icon gutter and alignment. The phone menu stayed within the viewport (right edge 371px, document width 390px). Desktop and phone downloads both matched the backend JSON for a task-created saved draft, which contained no model response or fabricated usage. The draft was then removed. This verifies actual backend-to-browser download for draft content; live generated multi-turn/attachment export remains unqualified.

All 275 dashboard tests across 48 files passed, including two new export tests: the downloaded blob uses authoritative backend content rather than cached history, and failed export shows an actionable error with no download or lost history. Type checking passed. Archive/recovery, ordinary reader/writer dashboard qualification, a fresh packaged SDK example and the complete real conversation lifecycle remain open. F03/F05/F09/F10 are not closed by this subset.
