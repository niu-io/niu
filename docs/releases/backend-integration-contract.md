# Backend interfaces for continuous frontend integration

Updated 2026-10-10. Route/contract baseline: `a2abcbe`. This is the current
integration baseline, not a claim that the complete release is qualified.
This is also the backend implementation checklist: every listed operation must
have a registered handler and an explicit contract. The listed routes currently
have handlers; incomplete business qualification is not a missing HTTP endpoint.
Do not replace working handlers with empty responses. A genuinely missing
operation should receive an authenticated, scope-checked stub with a documented
501 response and `x-niu-implementation: stub`, without data or financial mutation.
Frontend work can proceed on the interfaces below without waiting for every
merchant or upstream integration to be activated.

## Sources and conventions

- Executable routes: [gateway routes](../../apps/gateway/src/web/routes.rs).
  Request/response schemas: [root OpenAPI](../../contracts/openapi.yaml) and the
  focused contracts linked below. Use the [JavaScript SDK](../../sdks/javascript/src/index.ts)
  and its [administration client](../../sdks/javascript/src/admin.ts) where available.
- In the tables, `C = /admin/v1/organizations/{organization}`,
  `W = C/projects/{project}`, and `K = W/keys/{key}`. Expand these prefixes before
  making requests. Legacy `project` identifiers mean **workspace** in product UI.
- IDs remain routing/storage values; never display them as names. Supplier
  business identity uses the legacy `/providers` contract. `/vendors` represents
  independent upstream credential configurations belonging to a Supplier.
- Browser administration uses the existing member-session flow; never embed an
  installation token in frontend code. External inference uses a workspace API
  key. Dashboard inference uses the authenticated member plus a selected key ID.
- Follow each schema's envelope; do not assume every response is `{data: ...}`.
  Lists may include cursors/summary, inference uses protocol-specific responses,
  and result/export endpoints return binary/CSV. Preserve decimal monetary and
  revision strings exactly; do not round them through JavaScript `Number`.
- Mutations with `expected_revision` must send the revision read from the server.
  On 409, reload and reconcile the draft rather than silently overwriting changes.
  Null and zero have different meanings; do not omit required nullable fields.
- 401 requires renewed authentication; 403 denies an operation; scoped 404 may
  conceal another tenant's resource. Distinguish 402 balance/spending refusal,
  429 rate/concurrency refusal, unsupported capabilities and upstream failure.
  Render safe API error messages/types, never raw upstream bodies or credentials.

## Interfaces to integrate now

| Area | Methods and paths | Integration boundary |
| --- | --- | --- |
| Session | `GET /admin/v1/session`; `GET /admin/v1/auth/config`; `POST /admin/v1/auth/browser/login`, `/logout` | Use session scope and permissions. See [authentication contract](../../contracts/password-sessions.openapi.yaml); browser authentication qualification remains separate. |
| Workspaces | `GET/POST /admin/v1/workspaces`; `GET/POST C/projects`; `PATCH/DELETE W` | Backend owns names and saved scope. Deletion is a distinct destructive action, not a navigation change. |
| Supplier businesses | `GET/POST /admin/v1/providers`; `GET/PATCH/DELETE /admin/v1/providers/{provider}` | Business identity and membership are separate from credential configuration. See [Supplier contract](../../contracts/provider-business.openapi.yaml). |
| Supplier credentials | `GET/POST /admin/v1/vendors`; `PUT /admin/v1/vendors/{id}`; `GET/PUT /admin/v1/vendors/{id}/supplier` | Each key configuration has its own endpoint, enabled state, revision and model mappings. Keep procurement administration out of customer pages. |
| Models and configured prices | `GET/POST /admin/v1/vendors/{id}/models`; `GET/POST /admin/v1/vendors/{id}/catalog`; `POST /admin/v1/vendors/{id}/check` | Catalog/connection success does not prove generation. Keep upstream procurement rates separate from customer retail tariffs. |
| Workspace keys | `GET/POST W/keys`; `PATCH/DELETE K`; `POST K/rotate` | Create/rotate return a secret for the user to copy; never infer it from list data. Rotation retains the spending/rate lineage. Revocation preserves historical billing. |
| Key spending | `GET K/spending-limit`; `PUT K/spending-limit/{currency}`; `GET K/spending-limit/{currency}/history` | Decimal-string limit/revision. See [spending contract](../../contracts/key-spending.openapi.yaml). |
| Key RPM, concurrency and TPM | `GET/PUT K/request-rate-limit`, `K/concurrency-limit`, `K/token-rate-limit`; each has `GET .../history` | Fields are respectively `requests_per_minute`, `max_concurrent_requests`, `tokens_per_minute`; explicit null removes the limit, zero denies admission. See [RPM](../../contracts/key-request-rate.openapi.yaml), [concurrency](../../contracts/key-concurrency.openapi.yaml), [TPM](../../contracts/key-token-rate.openapi.yaml). |
| Workspace spending | `GET W/spending-limit`; `GET/PUT W/spending-limit/{currency}`; `GET .../{currency}/history` | Workspace commitment is separate from company balance. Do not reuse key-limit null semantics without checking the workspace schema in [billing](../../contracts/billing.openapi.yaml). |
| Text generation | `POST /v1/chat/completions`; dashboard `POST K/chat/completions` | Supported plain-text streaming, buffered structured JSON and function-tool paths have actual-call evidence. Streaming structured JSON is currently rejected; do not offer that combination as supported. |
| Requests and usage | `GET W/requests`; `GET W/requests/{attempt}`; `GET W/requests/export`; `GET/DELETE W/requests/{attempt}/payloads` | Use cursor/summary and recorded timing/error/usage fields. Unknown charge is not zero; payload absence does not erase diagnostics. See [request contract](../../contracts/request-observability.openapi.yaml). |
| Company funds | `GET C/billing/balance`, `C/billing/transactions`; `PUT C/billing/accounts/{currency}/warning-threshold` | Shared company funds require company-level financial access. Workspace ownership alone does not grant it. Credit/funding/reversal administration is not customer self-service. |
| Workspace billing | `GET W/billing`; `GET W/billing/invoices/{invoice}` | Customer amounts only. Media invoice lines use their own cursor; do not duplicate repeated text groups when fetching subsequent media pages. See [billing contract](../../contracts/billing.openapi.yaml). |
| Supported payments | `GET /admin/v1/platform/payments/integrations` | Installation-only capability inventory: EPay, Stripe and native PaymentFM. Inventory does not mean merchant activation or successful payment. |
| Available checkout | `GET C/billing/payment-methods`; `GET/POST C/billing/topups`; `GET C/billing/topups/{order}` | Freeze selected `payment_gateway`, currency, method and idempotency key with the submission. Offer only available methods. Browser return cannot credit balance. |

## Video interfaces and explicit unfinished behavior

The dashboard prefix is `K/video`; the corresponding external API uses
`/v1/video` with a workspace key. Integrate `GET .../models`,
`POST .../estimate`, `GET/POST .../jobs`, `GET .../jobs/{job}`,
`POST .../jobs/{job}/refresh`, `GET .../jobs/{job}/billing`,
`GET .../jobs/{job}/timings`, `GET/DELETE .../jobs/{job}/results`, and
`GET .../jobs/{job}/results/{kind}`. Use the root OpenAPI and SDK video types for
the exact model-specific input and status shapes; estimation is not a charge.

Personal OpenRouter generation, persistence, scoped retrieval and deletion have
actual-run evidence. A succeeded job can have an unavailable/expired result.
Refresh must not resurrect deleted data. Preserve pending, failed, unknown and
unavailable states; retrying a status query is not permission to submit a new job.

Customer media charging is **not fully verified**. A current OpenRouter query
returned upstream `usage.cost` without a reported billable duration. That expense
must not become a customer charge or appear in customer reports. Do not design a
completed video billing journey around inferred duration or fabricated amounts.
Media price/offer administration existing in the source is not end-to-end
settlement qualification.

## Evidence and integration order

On this update, actual installation-authorized reads of session, Supplier list,
credential configurations, workspace keys, request logs, workspace billing,
company balance and payment inventory all returned HTTP 200 on the running
backend. This verifies reachability and envelopes, not complete workflows.

Use these current-input records for the narrower business guarantees:

- [Supplier multi-key isolation](../reference/supplier-key-isolation-live.md).
- [Credit, exact charges, tariff changes and revocation history](../reference/internal-credit-workflow-live.md).
- [Company/workspace isolation](../reference/company-credit-concurrency-live.md)
  and [customer financial authorization](financial-authorization-live-2026-10-09.md).
- [Key RPM](../reference/api-key-request-rate-limits.md),
  [concurrency](../reference/api-key-concurrency-limits.md) and
  [TPM](../reference/api-key-token-rate-limits.md), including actual priced calls.
- [Payment capability boundary](../reference/payment-aggregators.md),
  [video retention](video-result-deletion-live-2026-10-09.md) and
  [bounded performance observations](../reference/priced-text-concurrency-live.md).

Integrate Supplier/key/model configuration and text calls first, then limits,
Logs and customer billing, followed by payment availability and video lifecycle
states. Do not wait for external merchant activation to build the supported
configuration and unavailable states. Frontend browser verification remains a
separate responsibility; this document makes no UI completion claim.

Backend changes to the interfaces above should update route/contract/SDK and this
handoff together, explicitly identifying changed fields and migration impact.
Prefer additive changes; keep compatibility names until a coordinated migration.
Each pushed increment should state what the frontend can consume now and which
states remain unverified. CI green status and fixture outcomes are not substitutes
for actual workflow evidence.

## Extractable handler comments

New or migrated handler documentation uses a Rust `///` fenced `openapi` block
containing JSON with `path`, lowercase `method` and an OpenAPI `operation` object.
The operation includes a unique `operationId`, summary, behavioral description,
security, parameter/request schemas where applicable, response schemas/errors,
and `x-niu-implementation` (`implemented` or `stub`). Document authorization,
null/zero semantics, revision/idempotency rules and side effects explicitly.
Do not include real credentials, tenant data or internal deployment paths.

Run `python3 scripts/extract-handler-openapi.py` to generate the annotated
[OpenAPI subset](../../contracts/generated/handler-operations.json) and
[API reference](../reference/generated-api-operations.md). Existing focused
contracts reference generated operations, and the root contract must reference
the focused path. `--check` detects stale generated files in CI. The generator
checks path registration and duplicate operations; it does not prove matching
HTTP methods, schemas or runtime behavior. Verify those against real HTTP and
independent artifacts before qualifying the operation.

Migrated operations include `listPaymentIntegrations` and workspace spending
list/read/write/history; the remaining handlers still use their existing focused
contracts. Annotation migration is incremental,
not a claim that the full API is generated yet. Frontend integration should use
the root contract, which includes both migrated and existing operations.

Root-entrypoint coverage is checked by `scripts/check-openapi-entrypoints.py`
for authentication, billing, Supplier business, platform configuration, key
policies and request reporting contracts. It checks registered path visibility,
not full API completeness or runtime correctness. Thirteen previously omitted
authentication, billing and Supplier revision paths have been linked into the
root contract; actual reads of authentication configuration, charge reconciliation,
media price models and media rates returned HTTP 200 on the current runtime.
This does not qualify media charge settlement or the listed write operations.

Workspace spending annotations now include shared schemas, exact nullable read
states, required decimal-string write inputs, scoped authorization and history
pagination. Actual HTTP reads, creation and history matched these generated
schemas in a separate native database. Stale revision writes returned 409, null
limit writes returned 422, and the saved revision survived restart with no
financial entries. These are real handlers; no placeholder data was introduced.
