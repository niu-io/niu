# Workspace and pool route migration

Implemented additively on 2026-10-20. Existing `/api/v1/organizations/.../projects/...`
and `/admin/v1/...` routes remain supported. No saved record, attempt, billing
entry, session UUID or idempotency receipt is rewritten. These are HTTP aliases,
not database data migrations.

## Session identity

Use `/api/v1/workspaces/{workspace}/sessions` for saved timeline inventory and
`/sessions/{session}` for a timeline. Every canonical operation requires
`category=video` or `category=chat`; mutations accept `video` only. Identity is
**workspace + authenticated owner + category + UUID**. The same UUID can exist
in both category stores. Missing, repeated or unsupported category values return
400; a Chat category cannot select a Video mutation. Legacy routes retain their
original default category for compatibility.

Chat projection reads preserve comparison branches. Guarded Chat writes, archive,
export, deletion and draft persistence use `/workspaces/{workspace}/chats` with
their existing payloads and revision rules. The projection does not imply Video
write parity. A saved session can reference multiple attempts. Model execution
lookup stays `/v1/generations/{id}`; Video jobs retain their existing inference
contracts and uncertain-submission recovery identities.

The SDK exposes `admin.sessions(workspaceId)` and accepts `{ workspaceId }` on
migrated saved-content methods. Existing `{ organizationId, projectId }` calls
remain source-compatible and use the canonical workspace routes. Deploy the
server migration before upgrading those SDK consumers. The old
`admin.generations(scope)` facade remains available.

## Workspace authorization and compatibility

The shared path extractor authenticates before resolving the organization from
workspace storage. Member scope limits that lookup; missing and foreign workspaces
return 404. The original handler then performs its normal permission, owner,
revision, retention, grant, billing and dispatch checks. A workspace alias does
not turn a saved-state read into inference authority. Installation credentials
retain their existing shared installation-owner semantics.

The following matrix is exhaustive for this migration. `W` denotes
`/api/v1/workspaces/{workspace}`; `L` denotes the supported legacy prefix
`/api/v1/organizations/{organization}/projects/{project}`. Each row preserves
the original request/response body, revision and idempotency scope. Canonical
session queries additionally require category. GET uses workspace Read; mutations
retain the original Write and operation-specific checks. Refer to each generated
operation for additional key, owner, retention or submission restrictions.

| Methods | Canonical path | Compatibility path |
| --- | --- | --- |
| GET, POST | `W/assets` | `L/assets` |
| GET, PATCH, DELETE | `W/assets/{asset}` | `L/assets/{asset}` |
| GET | `W/assets/{asset}/content` | `L/assets/{asset}/content` |
| GET | `W/video/intents` | `L/video/intents` |
| PUT, GET, DELETE | `W/video/intents/{intent}` | `L/video/intents/{intent}` |
| POST | `W/video/intents/{intent}/submit` | `L/video/intents/{intent}/submit` |
| GET, PUT | `W/video/draft` | `L/video/draft` |
| GET, PUT | `W/chats/draft` | `L/chats/draft` |
| GET | `W/chats` | `L/chats` |
| PUT | `W/chats/{id}/archive` | `L/chats/{id}/archive` |
| GET | `W/chats/{id}/export` | `L/chats/{id}/export` |
| GET, DELETE, PUT | `W/chats/{id}` | `L/chats/{id}` |
| POST | `W/tasks/{task}/refresh` | `L/generations/tasks/{task}/refresh` |
| POST | `W/tasks/{task}/results/{kind}/refresh` | `L/generations/tasks/{task}/results/{kind}/refresh` |
| GET, POST | `W/artifacts/{task}/{kind}/capture` | `L/generations/artifacts/{task}/{kind}/capture` |
| GET | `W/tasks` | `L/generations/tasks` |
| GET | `W/tasks/{task}` | `L/generations/tasks/{task}` |
| GET | `W/tasks/{task}/diagnostics` | `L/generations/tasks/{task}/diagnostics` |
| GET | `W/artifacts` | `L/generations/artifacts` |
| GET | `W/artifacts/{task}/{kind}` | `L/generations/artifacts/{task}/{kind}` |
| GET | `W/artifacts/{task}/{kind}/content` | `L/generations/artifacts/{task}/{kind}/content` |
| GET | `W/sessions` | `L/generations` |
| PUT, GET, PATCH | `W/sessions/{session}` | `L/generations/{session}` |
| PUT, DELETE | `W/sessions/{session}/turns/{turn}` | `L/generations/{session}/turns/{turn}` |
| PUT | `W/sessions/{session}/turns/{turn}/task` | `L/generations/{session}/turns/{turn}/task` |
| PUT | `W/sessions/{session}/turns/{turn}/intent` | `L/generations/{session}/turns/{turn}/intent` |
| GET | `W/billing` | `L/billing` |
| GET | `W/spending-limit` | `L/spending-limit` |
| GET, PUT | `W/spending-limit/{currency}` | `L/spending-limit/{currency}` |
| GET | `W/spending-limit/{currency}/history` | `L/spending-limit/{currency}/history` |
| GET | `W/requests` | `L/requests` |
| GET | `W/requests/{attempt}` | `L/requests/{attempt}` |
| GET, POST | `W/requests/{attempt}/usage-reconciliation` | `L/requests/{attempt}/usage-reconciliation` |
| GET | `W/keys/{key}/spending-limit` | `L/keys/{key}/spending-limit` |
| PUT | `W/keys/{key}/spending-limit/{currency}` | `L/keys/{key}/spending-limit/{currency}` |
| GET | `W/keys/{key}/spending-limit/{currency}/history` | `L/keys/{key}/spending-limit/{currency}/history` |
| GET, PUT | `W/keys/{key}/ip-policy` | `L/keys/{key}/ip-policy` |
| GET | `W/keys/{key}/ip-policy/history` | `L/keys/{key}/ip-policy/history` |
| GET, PUT | `W/keys/{key}/request-rate-limit` | `L/keys/{key}/request-rate-limit` |
| GET | `W/keys/{key}/request-rate-limit/history` | `L/keys/{key}/request-rate-limit/history` |
| GET | `W/keys/{key}/token-usage-window` | `L/keys/{key}/token-usage-window` |
| GET, PUT | `W/keys/{key}/concurrency-limit` | `L/keys/{key}/concurrency-limit` |
| GET | `W/keys/{key}/concurrency-limit/history` | `L/keys/{key}/concurrency-limit/history` |
| GET | `W/keys/{key}/capacity` | `L/keys/{key}/capacity` |
| GET, PUT | `W/keys/{key}/token-rate-limit` | `L/keys/{key}/token-rate-limit` |
| GET | `W/keys/{key}/token-rate-limit/history` | `L/keys/{key}/token-rate-limit/history` |

Alias contracts are derived from the same handler annotations through
`contracts/route-aliases.json`. The extractor checks route registration and
operation uniqueness. Removing any compatibility path requires a separate
published deprecation decision.

## Pool collection and members

| Method and path | Request and response | Authority, revisions and compatibility |
| --- | --- | --- |
| `GET /api/v1/pools` | Optional `after`/`limit`; `{data: [], has_more, next_after}` | Platform administrator or installation credential; live keyset pagination. |
| `GET /api/v1/pools/{reference}` | One pool in `{data: pool}` | Same platform authority as the existing lookup. Missing pool returns 404. |
| `GET /api/v1/pools/{reference}/history` | Optional `before_revision`; immutable revisions | Same history and revision contract as the compatibility query route. |
| `GET /api/v1/pools?alias=...` | Existing single-pool response | Retained; combining alias with collection paging is rejected with 400. |
| `GET /api/v1/pools/index` | Existing paginated collection response | Retained. |
| `GET /api/v1/pools/history?alias=...` | Existing revision response | Retained. |
| `PUT /api/v1/pools` | Existing alias/body and expected revision | Unchanged creation/update behavior; ownership remains immutable. |

`reference` is the **unpadded base64url encoding of the exact visible ASCII
alias bytes** (1–200 bytes). The SDK encodes it automatically. This uses only
letters, digits, underscore and hyphen, so slashes, percent signs, question marks
and fragments in an alias never become URL syntax or require double decoding.
For example `vendor/model` becomes `dmVuZG9yL21vZGVs`. Noncanonical encodings,
padding, whitespace and non-ASCII aliases are rejected. This is an API reference;
it is not a new browser slug or a user-facing label. Legacy `/admin/v1/pools`
continues its original query-based contract.

## Verification

The regression suite covers old/new session replay, category collisions,
required categories, read/write boundaries, personal ownership, sibling workspace
denial, pool cursors, exact alias restoration through a local HTTP proxy, and
real key responses validated against generated schemas. See
[the review evidence](api-design-review-evidence.md) for executed results and
remaining qualification limits. Successful fixture tests do not qualify an
external Provider or a production proxy configuration.
