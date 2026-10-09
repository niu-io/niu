# Workspace key activity verification

Qualified subset reviewed on October 4, 2026. F02, F09 and F10 remain open.

## Recorded activity

Workspace key metadata now includes nullable `last_used_at_ms`: the latest durable dispatch intent attributed to that key. Authentication alone does not count. An unfinished or uncertain dispatch still counts; this field does not imply successful completion or a customer charge. Null means no attributed dispatch is recorded. Older servers omitting the field show Unavailable in the dashboard.

Migration 0076 adds a scoped partial index for the latest dispatch lookup. Rotation preserves activity on the original key; the replacement starts without recorded activity. The API and JavaScript SDK expose metadata without key secrets or confidential Supplier expenses.

## Validation

- A fresh PostgreSQL storage test passed for undispatched requests, latest dispatch selection, rotation, reopened storage and workspace isolation.
- A fresh routed gateway test passed for viewer access, inference-token rejection and foreign-workspace nondisclosure. Metadata contains only the seven contracted fields.
- Five API-key dashboard integration tests, dashboard typechecking and 71 JavaScript SDK tests passed. The OpenAPI document parsed successfully.
- An extracted npm archive performed a live scoped metadata read: 24 keys, 14 with recorded dispatch activity. The default demo key remained active. This validates the distributed read method, not the complete packaged release.
- Archive SHA-256: `42fe9c85a1080dafce3761b471238295691a782432d68525d75a945509466f7d`.

## Visual and interaction review

The actual OpenRouter Keys table and row-action menu were inspected before editing. Niu's desktop table at 1280 pixels shows activity, status and compact row actions together. Long names wrap. Rotate and Revoke use the installed DropdownMenu and existing confirmation dialogs.

At 390 pixels, the rail is hidden and table scrolling is contained within the table rather than widening the document. Activity and actions remain reachable by horizontal scrolling. The row menu stays aligned; Revoke opens its confirmation and Keep key cancels it. Key details show the same activity without table scrolling. Desktop rotation confirmation was also opened and cancelled. No live key was rotated or revoked during this review.

The standard `pnpm dev` stack serves frontend HMR on port 2566 and the backend on 2567 with backend watching enabled. The existing database, demo key and signed-in browser session survived the backend restart.

## Remaining qualification

This evidence does not close complete key lifecycle, spending controls, ordinary-role browser workflows, session expiry, or full responsive product review. The live browser review used the demo administration context; ordinary-role authorization was exercised through the routed API test. Agent Observability was not edited.

## Packaged metadata example

The shipped `examples/inspect-keys.mjs` reads key metadata and prints names, status, model grants, expiry and latest dispatch time. It explicitly distinguishes null activity from an older endpoint omitting the field. Internal identifiers and unexpected credential fields are excluded. Failed authorization or malformed metadata exits unsuccessfully without publishing a successful partial result or the server's error body.

All 74 JavaScript SDK tests passed, including three child-process example fixtures. A freshly packed and extracted archive ran the example against the live demo workspace: 24 keys, activity available for each, and the default demo key still active. No inference or mutation was performed. Archive SHA-256: `7279986c0af5b09b699b6cd096783d7abdc6c6a0c522f678ef2130a60fccbfcd`. This read-only package checkpoint does not replace full packaged installation, role workflows or key lifecycle qualification.

## Pending key creation

Key creation now disables Name, Expiration, Cancel and Close while its request is pending. Previously Cancel could close the dialog before the one-time secret response arrived. A deferred-request regression verifies the dialog stays open and a failed request preserves the name while restoring controls. All eight KeysView integration tests and dashboard type checking passed. The actual OpenRouter key page and creation dialog were inspected as the reference; Niu keeps its existing creation flow and installed DropdownMenu. The running Niu dialog and expiration menu were checked at desktop and 390×640 widths. No live key was created, rotated or revoked. Pending and failure states are covered by the integration fixture, not live fault injection.

Pending create, rotate and revoke requests now receive an AbortSignal tied to the key page scope and account. Their late responses cannot update Chat credentials or the old dialog after unmount. A regression deliberately delivers a successful creation response after unmount and confirms no credential callback runs. Nine key integration tests and dashboard type checking passed. Idle creation and Cancel were rechecked in the running browser. This does not claim aborting reverses a mutation already committed by the server; the authoritative key list must be read again after returning.
