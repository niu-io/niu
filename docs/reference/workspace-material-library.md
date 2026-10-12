# Durable workspace materials

Status: local storage, member APIs, SDK and encrypted-content maintenance are implemented. Actual files, SDK isolation, stale revisions, deletion and restart are independently verified for the linked scopes. Additional byte-quota and task integration acceptance remain open. Saved materials are separate from Provider assets and generation permission.

The member API uses `/admin/v1/organizations/{organization}/projects/{project}/assets`. Workspace read permission allows listing, metadata and content reads; write permission allows uploading, renaming and deleting. Inference keys do not manage the library. Names are user-facing labels; asset IDs remain API references.

| Operation | Request | JavaScript admin SDK |
| --- | --- | --- |
| List | `GET /assets?kind=image&limit=50&after=…` | `listWorkspaceAssets` |
| Upload | `POST /assets?name=…`, raw bytes and exact `Content-Type` | `uploadWorkspaceAsset` |
| Metadata | `GET /assets/{asset}` | `getWorkspaceAsset` |
| Rename | `PATCH /assets/{asset}`, `name` and `expected_revision` | `renameWorkspaceAsset` |
| Delete | `DELETE /assets/{asset}`, optional `expected_revision` | `deleteWorkspaceAsset` |
| Download | `GET /assets/{asset}/content` | `downloadWorkspaceAsset` |

Uploads accept PNG, JPEG, WebP, MP4, WebM, WAV, MPEG audio and Ogg audio. Image validation decodes bounded pixels; audio/video validation parses container or frame structure. Validation is not a malware scan, content-policy approval, rights verification or Provider qualification.

Each material is limited to 8 MiB. A workspace retains at most 256 active materials and 256 MiB of active content. Concurrent uploads serialize quota checks in PostgreSQL. Capacity returns `409 asset_library_capacity_exceeded`; delete retained materials to make space. Per-process upload preparation and download decryption concurrency is bounded; busy preparation returns a safe availability error. These permits do not establish a bound on slow-client network delivery. These are configured implementation limits, not measured production capacity.

Content is encrypted with workspace and asset identity as authenticated associated data. Renaming preserves bytes and creation-order pagination. Revisions are decimal strings; stale changes return 409. Delete atomically creates an irreversible tombstone, erases encrypted bytes and records the change. Repeated deletion succeeds; missing and foreign content remain unavailable. Download authenticates content and verifies its saved byte length and SHA-256 before delivery, with attachment, no-store and nosniff headers.

Startup key validation and offline key rotation include this independent encrypted domain. Rotation preserves content identity and metadata; business APIs cannot overwrite saved bytes. Upload a new material to replace content. Immutable change records keep server-derived actor information internal.

## Generation integration boundary

Uploading does not inspect material for a model request, send it upstream, create a task, reserve money or grant reuse rights. The existing short-lived inspected-image ingestion and Provider readiness interfaces remain separate. A separate video input coordinator now accepts image-library references with explicit processing consent, resolves current scoped bytes privately, requires fresh configured inspection and records the material identity atomically with dispatch. Its qualified generation and deletion-race acceptance remain unverified. Collections and audio/video reference dispatch are not implemented by this API. They remain explicit work within S08-2; this storage facility does not close the full video workflow.

See the generated handler operations for exact response schemas and permission/error states. Clearing browser storage cannot erase saved library content.

Current-input acceptance: [SDK lifecycle](workspace-material-sdk-acceptance.md) verifies three media kinds, scoped permissions, revisions, encrypted-content deletion and restart; [format matrix](workspace-material-format-acceptance.md) verifies eight actual encoded formats, corresponding invalid uploads, independent decryption and full download decoding. The native Gateway was refreshed to `a8f9e68f` after a schema-284 backup. Readiness and saved routing configuration match; original encrypted Supplier identities and durable business counts are unchanged. A fresh schema-285 archive was restored independently with seven selected full-table fingerprints equal to the source. No additional Provider generation occurred.

The video request form is `{"type":"workspace_asset","workspace_asset":{"asset_id":"<API reference>","consent_to_process":true}}`, with an optional schema-supported `role`. A text prompt remains required. Image idempotency and mixing library references with ingested Provider references remain unsupported. Request logs retain the inspected prompt and original library IDs rather than copying resolved material bytes. Rename preserves content identity; deletion before dispatch prevents the atomic content claim. Deletion after dispatch does not cancel the existing job or remove its financial liability.
