# Niu API design review against OpenRouter

**Task tracking:** Current follow-up ownership, dependencies and execution status live in [Beads](../development/beads.md); search by the stable finding ID. Statuses below are dated review evidence, not a second live backlog.

Second review and additive implementation: 2026-10-20. Scope: route semantics,
authentication, response contracts, JavaScript SDK behavior, generated examples
and compatibility. The review findings below preserve the pre-fix evidence;
the implementation status table records what has subsequently changed.

## Implementation status

| Findings | Current implementation | Verification and remaining gate |
| --- | --- | --- |
| R01 | Shared metadata notification now covers inference, admin, auth and asset-binary transports, including errors and 204 responses. | Regression tests cover every transport helper, callback ordering, null references, cancellation on callback failure and no retry. |
| R07 | Additive item iterators cover workspaces, keys, Chat history, pools and Chat/Video session inventory. Complete workspace collection reuses the guarded iterator. | Tests cover empty/short pages, filters, cursors, exhaustion, missing/repeated continuations, stale 409s, cancellation and early return. Existing wire shapes remain unchanged. |
| R08 | Text inference annotations declare attempt and operation UUID headers on success and error responses, with early-rejection optionality. | Contract generation and regression checks pass. Live header/charge lookup and cross-origin deployment behavior remain unverified. |
| R09 | Examples render required encoded queries and separate security alternatives; cookie-only operations use cookies. | All generated operation examples checked for required queries; authentication combinations tested; a local curl round trip preserves encoded aliases and POST bodies. |
| R10 | `NiuStreamError` preserves API events, actual HTTP status, available correlation references and transport causes. Abort reasons remain unchanged. | Chat/Messages/Responses failure probes, framing, truncation, transport and cancellation tests pass. No live Provider fault injection was run. |
| R11 | Reusable workspace key schemas cover list/create/read/update/rotate responses, policies, exact amounts, optional snapshots and errors. SDK types reflect nullable snapshots. | Source and schema regression checks pass; dashboard typecheck passes. Real backend response validation remains outstanding. |
| R12 | Workspace creation guidance now recommends `/api/v1/workspaces`, distinguishes its supported alias, and retains historical evidence dates. | Current route registrations point both prefixes to the same handler. No new live replay test was run. |
| R04 | Security schemes now explain credential boundaries; key operations explicitly describe read/write management authority. | Audience-specific contract/SDK views and a complete per-operation authority annotation remain pending. |
| R03, R05, R06 | No session/workspace/pool route behavior changed in this implementation. | Backend build/integration verification has not run. Rust 1.98.0 was subsequently found already installed; Cargo was missing from PATH and is now enabled. Canonical identity, route aliases and migration tests remain required before moving consumers. |

Validation: **203 SDK tests passed**, **3 API documentation tests passed**,
dashboard TypeScript check passed, and generated API freshness passed.
The documentation below remains a review record, not a declaration that every
migration or live-service gate is closed.

The remaining problem is contract consistency: short paths still leave callers
guessing about identity, credentials, errors and continuation. Fix the confirmed
contract and SDK defects before another route migration. This review does not
establish complete OpenRouter compatibility or overall product parity.

At review time, OpenAPI contained **267 paths and 354 operations**. Of those,
**44 operations required query parameters**, which the old example generator
omitted. Success-response headers were declared on 45 operations, excluding the
three text inference endpoints examined below; the additive fix raises this to
48. These counts describe the contract snapshot, not a deployed installation.
See the [reproducible evidence](api-design-review-evidence.md).

## Findings and changes

| Priority | Concrete issue | Evidence | Change and acceptance condition |
| --- | --- | --- | --- |
| P1 implemented | The successful completion body can contain an upstream ID, while `getGeneration` requires a Niu attempt UUID. The initial callback fix omitted admin/auth transports. | `NiuClient.send` in `sdks/javascript/src/index.ts`; transport helpers in `admin.ts` and `auth.ts`. | Shared callback now implemented and regression-tested; live generation lookup remains a separate gate. |
| P1 fixed | The generation SDK test described a response the handler does not return. It used flat token/billing fields and a string `usage`, although the server returns nested `usage` and `customer_charge`. | The generation introspection test in `sdks/javascript/test/client.test.mjs`; `get_generation` in `apps/gateway/src/web/routes.rs`. | Replace the obsolete fixture and assert nested token counts and exact customer charges. Production schema validation remains a separate integration check. |
| P1 proposed | `generations` means an inference attempt under `/v1`, but a saved multi-turn session under the workspace management prefix. Shortening the session path did not resolve this semantic collision. | `generations_sessions.rs`, `generations_inventory.rs` and `routes.rs`. | Reserve generation terminology for execution records. Move saved timelines into one clearly defined session resource, with Chat and Video as categories. A session may reference many generations; a generation must not change meaning according to the API prefix. Plan a compatibility migration before changing the current routes again. |
| P1 proposed | The aggregate contract is useful, but generic security schemes and navigation tags do not reliably describe each caller's authority or usable SDK surface. This is a usability issue, not evidence of an authorization bypass. | OpenAPI security schemes; `apps/docs/scripts/openapi-navigation.mjs` and `generate-api-docs.mjs`. | Annotate principal types, required role/capability and scope. Generate model, customer management, console and platform/Provider views while retaining the aggregate; distinguish platform from Provider authority. Keep backend authorization and avoid duplicating handlers or hosts. |
| P2 proposed | Workspace/key APIs already have short workspace-scoped routes, while saved content and many management operations still require organization plus legacy project context. `TenantScope` exposes both identifiers. | `TenantScope`, `listWorkspacesPage`, key methods and saved-content methods in `sdks/javascript/src/admin.ts`. | Extend the existing `/workspaces/{workspace}` pattern to customer management resources. Resolve organization membership on the server and test cross-workspace denial. Keep existing compatibility routes during migration. |
| P2 proposed | A pool collection GET reads one alias from a required query; listing uses an extra `/index` suffix. Shortening `model-route-pools` to `pools` left this inconsistent collection behavior intact. | `PoolQuery` and `IndexQuery` in `apps/gateway/src/vendors/route_pools.rs`; SDK pool methods. | Use collection GET for listing and a member GET for one alias. Model aliases can contain `/`, so specify and test alias encoding or a stable member reference before selecting a member path. Do not blindly interpolate an alias. |
| P2 implemented | Similar directories expose `next_cursor`, `next_before` or `next_after`, and consumers previously had to map outgoing cursors themselves. | Workspace, Chat, generation-session and pool page types in the JavaScript SDK. | Additive item iterators now adapt those wire formats, detect invalid continuation and preserve live-view semantics. Concurrent backend mutation remains an integration gate. |

## OpenRouter comparison

OpenRouter uses an OpenAI-style Chat completion request and a generation lookup
for one execution's metadata. Its workspace directory and key management also
have compact resource paths. These are the relevant reference patterns; a Niu
console draft endpoint is not an OpenRouter-compatible model operation.

Sources checked:

- [API overview](https://openrouter.ai/docs/api/reference/overview)
- [Generation metadata](https://openrouter.ai/docs/api/api-reference/generations/get-generation)
- [Workspace directory](https://openrouter.ai/docs/api/api-reference/workspaces/list-workspaces)
- [Official OpenAPI specification](https://openrouter.ai/openapi.json), including key management

Niu should preserve its own exact decimal customer charges and explicit unknown
execution states. Do not copy procurement-cost fields into customer responses to
match another provider's schema. Shorter paths must not weaken authorization,
persistence, uncertainty handling or billing boundaries.

## Representative calling flows

| Task | Niu contract flow | Assessment |
| --- | --- | --- |
| Generate text with an existing key | One `POST /v1/chat/completions` with model and messages. | Already one call. A draft, saved session or management credential is not required. Claims that Niu requires those prerequisites are incorrect. |
| Query that attempt's charge | Capture `x-niu-attempt-id`; one `GET /v1/generations/{id}` using the same authorized workspace credential. | Two calls including inference. The SDK metadata callback now makes the reference accessible; pending or absent charges remain explicit. |
| Find a workspace and inspect its keys | `GET /api/v1/workspaces`, then `GET /api/v1/workspaces/{workspace}/keys`, following page continuations when present. | Already uses short workspace resources. The long legacy prefix is not required for this flow. |
| Restore an unsent console input | Console draft GET with authenticated owner and workspace scope. | A console persistence operation. Keep backend persistence, but do not present this as a prerequisite for model API use. |

The SDK regression tests exercise request URLs, methods, metadata and response
handling through a controlled fetch transport. They do not prove a running
Gateway, Provider execution, live billing or tenant authorization. The first
round reported no Gateway on the local development port and no Cargo available.
No backend end-to-end verification was performed in the second round.

## Migration order

1. Deliver the additive SDK response metadata fix and corrected fixtures.
2. Separate contract views and document one-call model access before moving routes.
3. Define generation/session identities and their references, then add migration
   aliases and contract checks before updating clients.
4. Extend workspace-scoped management routes and normalize SDK pagination.
5. Remove compatibility paths only under an explicit release/deprecation policy.

Do not perform another blanket route rename as a substitute for these changes.

## Second-round findings and acceptance criteria

IDs R01–R07 refer to the seven findings above, in order. R08–R12 were added in
the second review. The descriptions in this section record the original
defects and acceptance criteria; consult the implementation status above.
P1 means a core caller flow or advertised contract is incomplete; it does not
imply a security vulnerability. Confirmed findings below come from source
inspection or controlled SDK probes, not deployed-service tests.

### R01 — Shared response options must behave consistently

[`NiuAdminClient`](../../sdks/javascript/src/admin.ts) and
[`NiuAuthClient`](../../sdks/javascript/src/auth.ts) accept `RequestOptions`,
including `onResponse`, without invoking it. A controlled fetch probe produced
callback counts of **1, 0, 0** for inference, admin and auth clients respectively.
The first review's “fixed” status was too broad.

Prefer one response-metadata hook contract across all three clients, including
JSON, streaming, binary and 204 responses. It must run once after headers arrive
and before body handling, including for HTTP errors. Missing references remain
null. A callback exception must cancel the body and must not trigger a retry.

**Acceptance:** exercise every transport helper, not just each client class.
Include success, HTTP failure, empty response, binary response and callback
failure; verify invocation count, metadata and body cleanup.

### R08 — Correlation headers belong in the public contract

`POST /v1/chat/completions`, `/v1/responses` and `/v1/messages` declare no
success-response headers in the
[generated OpenAPI](../../contracts/generated/public-openapi.json).
The [inference implementation](../../apps/gateway/src/web/inference/common.rs)
attaches `x-niu-operation-id` and `x-niu-attempt-id` to dispatched responses.
The SDK needs the attempt UUID for `GET /v1/generations/{id}`. Generated clients
cannot discover this relationship from those response schemas.

Document each applicable correlation header, its identity and availability.
Do not promise an attempt ID for a request rejected before an attempt exists,
or confuse an upstream completion ID, Niu attempt ID and operation ID.
Video job creation already declares `x-niu-attempt-id`; extend the existing
annotation mechanism.

**Acceptance:** handler annotations, OpenAPI, REST docs and SDK agree on header
names, formats and optionality. Verify JSON and SSE responses, early rejections
and a successful generation lookup. Check browser header exposure if
cross-origin browser use is supported.

OpenRouter also exposes generation identity in a response header. Using a
header is valid; omitting it from the usable contract is the defect.
See its [streaming reference](https://openrouter.ai/docs/api/reference/streaming).

### R09 — Generated examples must honor parameters and security schemes

[`generate-api-docs.mjs`](../../apps/docs/scripts/generate-api-docs.mjs) renders
required headers but no query parameters. For example, the
[pool read example](../../apps/docs/src/content/docs/api/rest/getmodelroutepool.md)
requests `/api/v1/pools` without its required `alias`. There are 44 affected
operations, including media reads and billing queries.

The generator emits Bearer authentication whenever a security requirement
exists and chooses the token variable from the URL prefix.
`POST /api/v1/auth/browser/logout` declares only `memberCookie`, yet this logic
emits a Bearer example. The operation's actual permission description remains
authoritative; a path prefix does not determine the credential.

Generate encoded required-query placeholders and authentication from the chosen
security alternative. Preserve AND requirements within one alternative and OR
choices between alternatives. Cookie-only operations need a cookie-based
example; do not embed real credentials. Public operations need no auth header.

**Acceptance:** inspect generated request structure against every operation's
required parameters and selected security scheme. Include aliases containing
`/`, spaces and punctuation, cookie-only auth, header API keys and combined
schemes. Generated-file freshness alone must not satisfy this gate.

### R10 — Streaming failures need structured errors

[`parseChatStream`](../../sdks/javascript/src/index.ts) throws plain `Error`
for an SSE `error` payload, `event: error` and `response.failed`.
The controlled Chat stream probe lost both the error payload and the attempt
reference. Before streaming, HTTP failures instead produce `NiuAPIError`
with response data and correlation metadata.

Keep a typed streaming error carrying the original event and available
response metadata. Distinguish API failure, malformed stream, unexpected end
and caller cancellation. Preserve the actual HTTP status, including 200 after
headers have been committed; do not fabricate an HTTP status from an event.
An error event may be the first event. Failed or interrupted generation must
not be automatically resubmitted.

**Acceptance:** test pre-stream HTTP failure, first-event failure, failure
after content, protocol-specific failure events, missing terminal event and
abort. API failures retain available correlation references and structured
error data. Preserve protocol-specific successful and incomplete terminal states.

OpenRouter documents the same distinction between HTTP failure before commitment
and error events after commitment. This supports the transport distinction,
not a claim about its SDK's exception types.
See [streaming error handling](https://openrouter.ai/docs/api/reference/streaming).

### R11 — Key-management schemas must be useful to generated clients

In [`workspace_aliases.rs`](../../apps/gateway/src/admin/workspace_aliases.rs),
`GET /api/v1/workspaces/{workspace}/keys` describes each key as just
`{ "type": "object" }`; POST does the same for its `key` response.
GET declares only 200 and POST only 201. The implementation performs
authorization, validation and storage operations, and the
[SDK](../../sdks/javascript/src/admin.ts) already exposes `WorkspaceKeyDetail`
with limits and policies.

Define reusable response schemas with actual fields, required values,
nullability, units and revision representations. Document the one-time secret
on creation separately from list/detail responses. Enumerate actual failures
from the handler and its dependencies, using the existing error model rather
than inventing a second envelope.

**Acceptance:** validate real list/create/error responses against the contract,
including policy null versus empty semantics, pagination and exact monetary
values. Generated types must expose key details without `any` or an empty
object. List/detail serialization must never disclose the creation token.

### R12 — Migration guidance must identify the current entry point

The [workspace compatibility guide](workspace-creation-compatibility.md) directs
new clients to `POST /admin/v1/workspaces`, while the public operation and
current SDK use `/api/v1/workspaces`. Its older verification section is historical
evidence and should remain labeled with its original date.

Update the guide's recommendation from verified current route registration;
distinguish canonical, supported alias and removed route. Keep its substantive
idempotency rules: cross-route replay has input restrictions, and a retry with
different input can conflict.

**Acceptance:** every recommended URL resolves to its documented handler;
alias tests cover authorization, body shape and replay identity. Do not relabel
historical verification as a backend test of the new path.

## Refined resource decisions

### R03 — Separate executions, sessions and asynchronous jobs

| Resource | Current meaning | Design constraint |
| --- | --- | --- |
| `/v1/generations/{id}` | One Niu inference attempt's metadata and customer charge | Keep attempt identity distinct from upstream output identity. |
| Workspace-scoped `/generations` | Saved Chat/Video timeline inventory | A session can contain many attempts. |
| `/v1/video/jobs/{id}` | Durable asynchronous video job | Preserve uncertain submission and recovery references. |
| Workspace-scoped `/chats/draft` | Saved unsent console input | Owner/workspace persistence, not a model API prerequisite. |

A proposed saved-content resource is
`/api/v1/workspaces/{workspace}/sessions`, with explicit category and identity
rules. This is not a supported endpoint. A flat `{id}` lookup must not assume
that category-specific stores share one global namespace.

Preserve owner scope, branches, model comparisons and existing write capabilities.
The current Chat inventory bridge does not establish write parity with Video.
See the [session/task/artifact handoff](generations-session-task-artifact-handoff.md).
Acceptance requires unambiguous identities and old/new route equivalence before
consumer migration, not merely shorter paths.

### R04–R06 — Authority, workspace scope and collection behavior

The current OpenAPI security schemes have no descriptions, and `bearerAuth`
appears on both inference and privileged management operations. Document
accepted principals, required roles/capabilities and resource scope per
operation; generate audience views from those annotations. OpenRouter's
[management-key guidance](https://openrouter.ai/docs/guides/overview/auth/management-api-keys)
distinguishes management from ordinary inference authority. Borrow that clarity
without assuming Niu needs the same credential implementation.

Extend `/workspaces/{workspace}` only where the workspace determines its
organization. Resolve membership on the server, preserve owner checks and
test sibling-workspace denial. Keep UUIDs in existing API contracts; readable
browser slugs are a separate product URL concern.

For pools, choose and test an alias encoding or stable member reference before
prescribing `/pools/{alias}`. Verify behavior through proxies and routers,
including aliases containing `/`. Keep revision checks and collection
pagination. Do not change an existing collection response shape in place.
Evidence: [pool handlers](../../apps/gateway/src/vendors/route_pools.rs).

### R07 — Pagination differs in guarantees, not only spelling

Unpaged Chat history returns only the latest 100 records. Paged reads may
return fewer than the requested count while still providing a cursor.
Changed or foreign cursors can return 409; the order is mutable, not a
cross-request snapshot. See [Chat continuation](chat-history-pagination.md).

Provide explicit page methods and additive iterators. Keep cursors opaque;
terminate on the documented continuation signal, not a short page.
Detect repeated cursors and define whether a stale cursor is surfaced or
restarted. Do not silently restart into duplicates or promise complete
history from a legacy bounded-list method.

**Acceptance:** empty and short pages with continuation, exhaustion, repeated
cursors, stale cursors, archive filters and concurrent changes. Preserve each
resource's ordering and snapshot guarantees.

OpenRouter's [workspace list](https://openrouter.ai/docs/api/api-reference/workspaces/list-workspaces)
uses offset/limit. That is not a reason to replace Niu's keyset pagination;
compare ease of traversal and documented guarantees.

## Delivery gates

| Order | Work | Evidence required before closing |
| --- | --- | --- |
| 1 | Complete R01 and repair R08–R11 | Consistent callback behavior; structured stream errors; usable generated examples; complete response schemas. |
| 2 | Clarify R04 and R12 | Credential/audience metadata, current entry-point guidance and verified aliases. |
| 3 | Resolve R03, R05 and R06 | Explicit identity model and old/new route migration matrix before moving consumers. |
| 4 | Add R07 traversal | Iterator termination, stale-cursor behavior and documented bounded-list semantics. |
| 5 | Retire obsolete paths | Published deprecation policy and old/new client compatibility evidence. |

The migration matrix must record method, path, request, response, authority,
idempotency scope and revision behavior. Prefer single-word resource nouns and
hierarchy; every compound segment needs a meaning or external-compatibility
justification. Verify which historical aliases actually exist: earlier naming
changes removed old spellings, so this review does not establish their backward
compatibility.

Workspace creation and video submission already have specific replay rules.
Do not imply that all POSTs are replay-safe. Preserve original job and
idempotency references after uncertainty, and separate reading saved state
from explicitly refreshing upstream state. Preserve revision conflicts and
customer billing boundaries during migration.

R02 still requires actual handler-response validation, including unavailable
charges and authorized scope. Hand-authored fixtures do not establish handler
conformance.

## Second-round verification

This round rebuilt the SDK, ran controlled callback/stream probes, inspected
handler annotations and generated references, and passed `pnpm check:api`
(354 REST operations, 377 SDK exports). The
[evidence appendix](api-design-review-evidence.md) contains reproduction commands
and observed results.

No live inference, billing, tenant authorization or backend integration tests
were run in this round. The first round reported 179 passing SDK tests; that
historical result is not new backend qualification. Open findings remain open
until their specified acceptance evidence exists.

## Continuation checklist

The earlier statement that Cargo was not installed was incorrect: the existing
Rust 1.98.0 toolchain was outside the shell PATH. PATH setup was corrected without
installing another toolchain or compiling Rust. Backend work was then deferred
for handoff at the user's request, not because Rust is unavailable.

1. Use the CI-pinned Rust 1.98.0 toolchain. Run workspace Clippy and compile test
   targets with the lockfile before changing route behavior.
2. Complete R04 with explicit per-operation audience/authority metadata and
   generated contract/SDK views. Preserve the aggregate contract.
3. Resolve R03 identities before adding saved-session routes; preserve the
   category/ID distinction and owner scope. Add workspace aliases for R05 and
   collection/member pool behavior for R06 with old-client compatibility tests.
4. Verify actual handler responses, generation lookup, exact customer charges,
   scope denials, uncertain execution, idempotency and migration aliases against
   an isolated backend. Fixture and compilation results do not establish live
   Provider execution or billing correctness.
5. Update this status table with the resulting evidence before retiring routes.

This API commit excludes concurrent currency, payment and dashboard work.
Generated references must be checked against the committed API source, not
against additional uncommitted handlers from another task.
