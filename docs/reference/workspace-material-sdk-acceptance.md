# Workspace material library SDK acceptance

The implemented durable workspace material library and its seven JavaScript administrator helpers have actual current-input acceptance for the lifecycle below. This covers saved local materials, without qualifying content inspection, Provider ingestion or media generation.

## Pinned execution

Gateway and compiled JavaScript SDK both use committed revision `a8f9e68fb7e221f612a1e415db7a763bf9162720`. The independent verifier checks the retained Gateway binary SHA. A stopped PostgreSQL copy is migrated from maximum applied version 284 to 285; native `_sqlx_migrations` records all migrations successful. The original runtime, database, encryption identity, credentials and financial configuration remain untouched.

Three new files are actually encoded locally for this run: a PNG image, PCM WAV audio and H.264 MP4 video. The files decode successfully with FFmpeg. The image filename includes Chinese characters. Audio upload uses a typed-array subview with surrounding padding, verifying that the SDK sends only the selected file bytes.

The compiled SDK delegates to actual native HTTP through `uploadWorkspaceAsset`, `listWorkspaceAssets`, `getWorkspaceAsset`, `renameWorkspaceAsset`, `downloadWorkspaceAsset` and `deleteWorkspaceAsset`. Listing also exercises page cursors and each media-kind filter. The execution captures 70 actual HTTP responses and one actual pre-aborted fetch, rather than fixture responses.

| Exercised operation | Actual result and independent check |
| --- | --- |
| Upload image, audio and video | HTTP 201; native metadata agrees with exact name, MIME type, kind, byte length and SHA-256; initial revision is `1`. |
| List, filtered list and cursor traversal | Three scoped objects; one-object pages traverse the same three identities; each kind filter returns its one saved object. |
| Detail and download | Owner and viewer read successfully; complete downloaded bytes equal the uploaded files. |
| Rename and stale writes | Successful rename advances revision to `2`; rename and delete with old revision `1` return 409. |
| First Gateway restart | Renamed metadata persists; viewer downloads remain byte-identical. |
| Delete | Owner succeeds; subsequent detail and content reads return 404 and the active list is empty. |
| Second Gateway restart | The empty list and 404 detail/content results persist. |
| Role and scope boundaries | Viewer upload, rename and delete return 403. Foreign-company and sibling-workspace operators return 403 for the exercised reads. An inference key cannot manage materials and returns 401. |
| Transport settings | Actual fetch calls retain the client's fixed authorization and `redirect: error`, including binary calls given unsupported caller override properties. A pre-aborted upload raises `AbortError`; no additional object is saved. |

## Independent final-artifact verification

A separate reader reopens the stopped source and final databases. Before deletion, the saved native snapshot contains three real encrypted content envelopes. The verifier decrypts each envelope using the original encryption identity and its exact organization/workspace/asset AAD, independently comparing plaintext with both source files and post-restart downloads. All three byte sequences, lengths and SHA-256 values match.

The final database contains exactly three new metadata tombstones at revision `3`, retaining their renamed names, original scope, content type, kind, length and hash. Their encrypted content rows are absent. The immutable event table contains exactly nine events: creation at revision `1`, rename at `2` and deletion at `3` for each object, attributed to the actual authorized owner. Failed stale, viewer and aborted operations add no object or revision/event.

Stored raw HTTP response hashes agree with the captured SDK observations. Four temporary operators and the verification inference key are revoked. All seven complete financial-table fingerprints remain identical to the source: attempts, customer charges, balance entries, funding receipts, customer balance reservations, cost reservations and Provider earnings. There are zero new Provider requests. All verification database and Gateway processes are stopped.

## Explicit limits

This closes the exercised compiled-SDK local material lifecycle and persistence boundary. It does not claim successful Provider processing, inspection approval or material-to-generation dispatch. Observing `redirect: error` in real fetch calls does not verify an actual redirect response, and the pre-aborted upload does not qualify cancellation midway through a transfer. Concurrent quota exhaustion, all invalid-media boundaries and key rotation of this newly populated domain require their own evidence when included in a broader criterion. No browser or UI acceptance is claimed.
