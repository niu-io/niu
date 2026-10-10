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

### Implemented backend: durable Video submission intent

The text-only backend dependency identified by the frontend recovery audit now
has implemented actor-owned routes. See the [complete contract and retention
rules](../reference/video-submission-intents.md) and the generated handler OpenAPI.
Under `/admin/v1/organizations/{organization}/projects/{project}/video-intents`:

- `GET` lists the actor's metadata index with scoped cursor pagination.
- `PUT /{intent}` saves an immutable validated request and original selected-key
  association under a fresh client-generated UUID. Default controls are saved
  explicitly. Identical retries preserve the record; changed content/key conflicts.
- `GET /{intent}` restores authorized content and resolves the original job or
  preparation state without dispatch, polling or reserving funds.
- `POST /{intent}/submit` explicitly submits/replays the saved document using
  `expected_revision`; it preserves one server-owned submission identity and the
  original key rotation lineage. The legacy create endpoint must not be used as
  an alternative submit route for this intent.
- `DELETE /{intent}` clears retained content with `expected_revision`. Tombstones
  prevent resurrection. Deletion is not cancellation of an accepted request.

Content is retained for 30 days or until deletion. Metadata/tombstones remain;
expired content is unreadable immediately and cleanup clears it from live
storage. Current actor/workspace permission, model grants and selected-key source
policy apply. Full reads resolve rotation only within the original key lineage;
unrelated keys cannot replace its billing source. The index exposes no prompts,
model or key content and remains available for erasure after key revocation.
Images/media references remain unsupported for saved-intent creation/submission.

Current native HTTP runs exercised concurrent identical saves, changed-input and
actor/workspace denial, deletion replay, revoked-key denial, rotation, restart,
materialized defaults and one actual personal video submission whose accepted
response body was discarded. Concurrent and restarted replay returned its original
job; independent storage retained one upstream submission and no customer debit.
The completed media artifact was downloaded and fully decoded. A separate injected
database interruption before dispatch retained one original preparation across
restart/replay, with no dispatch, transport span or balance entry.

Frontend acceptance remains open: actual browser interruption, page reload,
cache-free/second-browser restoration and the supported interaction states still
need verification. These backend observations do not qualify customer-funded
video settlement, all rotation timings, reference-input recovery or wall-clock
expiry after 30 days. No frontend-only persistence is authorized as a substitute.

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
| Workspace keys | `GET/POST W/keys`; `PATCH/DELETE K`; `POST K/rotate` | Create/rotate return a secret for the user to copy; never infer it from list data. Creation requires `ttl_seconds` (1–31,536,000) and model grants. Metadata PATCH uses an integer `expected_revision`, unlike decimal-string policy revisions. Rotation retains expiry and spending/rate/IP lineage. Revocation preserves historical billing. |
| Key source restrictions | `GET/PUT K/ip-policy`; `GET K/ip-policy/history` | `allowed_cidrs: null` allows all sources; an empty list denies all. Networks are normalized and policy follows rotation. Only configured trusted proxies may supply forwarding identity. See [IP policy contract](../../contracts/key-ip.openapi.yaml). |
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
checks literal Axum path/method registration, duplicate operations and local schema
references. It rejects the OpenAPI 3.0 `nullable` keyword in annotated schema nodes;
use an explicit null type or composition branch for OpenAPI 3.1. Example data and
properties named `nullable` are not mistaken for schema keywords. This check is
limited to handler annotations and does not prove response schemas or runtime behavior. Verify those against real HTTP and
independent artifacts before qualifying the operation.

Migrated operations include `listPaymentIntegrations`, workspace spending
list/read/write/history, key RPM/concurrency/TPM read/write/history and the key
token-usage window; the remaining handlers still use their existing focused
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

The ten key-policy operations retain their existing paths, operation IDs and
request/response definitions. Old focused schema references remain aliases to
the generated definitions. Current-input management calls verified unconfigured
reads, setting a finite value, history, explicit null removal, stale-write 409,
empty token usage and restart persistence. No inference or financial mutation
was needed for that contract check. Prior actual priced-admission evidence remains
linked above; annotation migration is not new inference qualification.

Key monetary spending list/write/history now also use handler annotations. The
previous history response had only a description; its generated schema now
declares currency, nullable limit, revision, timestamp and safe actor fields.
Actual HTTP verification covered an unconfigured limit, finite allowance,
explicit null removal, history, stale revision rejection and restart persistence.
Unlike workspace monetary limits, key monetary limits accept null for unlimited.
Remaining key allowance is not company available balance or a guarantee that
another admission check will accept a request.

Request detail now has a root OpenAPI entry and a handler-generated response
schema, including nullable timing, failure classification, token counts and
customer charges. Five current persisted request details matched the declared
field types, required fields and decimal patterns over real HTTP; each response
used `Cache-Control: no-store`, and an absent request returned 404. This read-only
check does not qualify new inference or billing behavior. Legacy task evidence
remains an opaque field rather than an expanded observability contract.

`GET /admin/v1/platform/configuration` is also implemented and included in the
root contract. Its payment gateway flags describe configuration presence, not
checkout availability or external merchant qualification. A saved disabled EPay
configuration still counts as present. Actual HTTP returned only gateway names
and boolean flags; an invalid bearer returned 401 and a workspace owner returned
403. The temporary verification operator was revoked. Use integration inventory
for supported adapters and customer payment-method discovery for usable checkout.

EPay configuration read/write now have handler-generated request and response
contracts. Disabled drafts accept an empty method list, but unsupported or
duplicate methods return 400 before persistence. Previously, an actual disabled
write with an unsupported method returned 200 and saved a configuration. After
the fix, the same current-input HTTP workflow on a separate native database
returned 400 with no configuration row or audit event. Supported methods saved
successfully; duplicate methods returned 400, a stale revision returned 409,
and the sanitized saved response survived gateway restart. Independent database
reads confirmed one accepted configuration event and no balance entries. This
verifies configuration persistence, not an external checkout or payment.

The EPay secret lifecycle was separately exercised through actual configuration
HTTP writes on a native isolated database: initial secret save, blank-key update,
gateway restart, and explicit replacement. Responses contained only `has_key`,
never the secret. Independent AES-GCM decoding of the persisted authenticated
envelopes confirmed the original secret survived the blank update and restart,
and the replacement was saved exactly. Three accepted writes produced three
audit events and no balance entries. Existing merchant configuration was not
modified; no external checkout or merchant activation is implied.

A separate current-input run used two gateway processes sharing the isolated
native database. Concurrent EPay updates submitted the same revision with
different merchant labels and blank keys. Exactly one returned 200 and one 409;
the database added only one revision and audit event. Independent decryption
matched the accepted merchant label and retained the prior secret. Restart
preserved the accepted revision, with no balance entries. On 409, reload the
configuration and let the caller resolve the edit; do not blindly replay it
with a newer revision.

A current-input EPay checkout run configured an isolated installation with a
fresh secret and reserved example-domain checkout URLs, without contacting an
external gateway or simulating a paid callback. The real HTTP top-up endpoint
created a CNY 12.34 pending order. Independent parsing and MD5 calculation verified
the checkout amount, method, merchant, order reference and signature; the URL did
not contain the secret. Identical retries before and after restart returned the
same saved checkout. Reusing the idempotency key with a changed amount returned
409, as did a merchant configuration change while the order remained unresolved.
Independent database reads found one order, no settlement and no balance entry.
This qualifies checkout artifact creation and recovery only, not payment receipt.

Current-input pending-checkout authorization was also exercised with real
company-owner, foreign-company-owner, company-viewer and workspace-owner tokens.
The company owner could read its order and history. The other roles could not
read that company's order/history/method discovery or create a top-up: the viewer
write returned 403, while the other denied cases returned 404. Looking up the
order under a different company returned 404 without exposing its checkout URL.
The database still held only the original pending order and no balance entries;
all temporary operators were revoked. Company billing requires company-level
owner/admin scope, not merely workspace ownership.

The enabled EPay creation endpoint was additionally exercised with current HTTP
inputs for zero/negative amounts, integer overflow, a decimal-string amount,
sub-cent precision, an unsupported method, an unsupported currency and lowercase
currency. Each returned 400. Independent reads before the subsequent valid
request confirmed no top-up order or balance entry had been saved. The valid
request then completed the pending-checkout/signature/restart workflow above.
For CNY, send an exact positive nanounit integer string divisible by 10,000,000;
do not send the displayed decimal amount as `amount_nanos`.

Top-up history pagination was exercised with 105 pending orders created through
the real EPay HTTP endpoint in an isolated database, without following checkout
URLs. The first page returned 100 entries and the second five, with no further
cursor. Their combined identities exactly matched an independent database query,
without duplicates or omissions. Replaying the first cursor after gateway
restart returned the same second page; a missing cursor returned 409. No order
was settled and no balance entry was created. This fixed-data traversal does
not establish snapshot pagination while orders are being inserted concurrently.

A current-input IP-policy run denied both direct disallowed access and spoofed
forwarding headers. Denied inference created no attempt. An allowed loopback
source completed an actual personal-model call; rotation retained the policy
and invalidated the old secret. Empty networks denied access, null restored it,
and independent storage reads matched four policy-history revisions. Temporary
keys and operators were revoked. This does not qualify every reverse-proxy
deployment or video operation.

A current-input expiry run created an eight-second workspace key and rotated it
immediately. Independent database reads confirmed the replacement retained the
exact original expiry timestamp. The old secret returned 401; the replacement
completed a real personal-model request with the exact requested fresh marker
before expiry. After expiry, the same inference endpoint returned 401 and the
replacement still had exactly one attempt, with none for the original secret.
Temporary keys were revoked and existing credentials were unchanged. Rotation
must not be presented as an expiry extension in frontend integration.

Trusted-proxy inference was separately verified on a real secondary listener
with loopback peers configured as trusted. A forwarded chain containing an
allowed prefix followed by a disallowed untrusted hop returned 403 and created
no attempt. An allowed client followed only by trusted hops completed an actual
personal-model request with the exact fresh marker and one persisted attempt.
The listener stopped and the temporary key was revoked. This validates the
exercised configured trust chain, not an arbitrary production proxy deployment.

A current-input model-grant edit used two owner-funded aliases and the same key
secret before and after narrowing access. The removed alias returned 404 without
creating another attempt, while the retained alias completed a fresh-marker
model call. A stale metadata revision returned 409. Independent database reads
confirmed revision two, exactly two successful-call attempts and no customer
charges. Temporary access and routes were disabled; the original encrypted
credential remained unchanged. This verifies subsequent admission, not
cancellation of requests already dispatched before a grant edit.

Workspace deletion was exercised with actual scoped tokens in a separate native
database. A workspace owner and company viewer each received 403; independent
storage reads confirmed the workspace remained. A company owner deleted a
separate empty workspace with 204. Revoking a workspace-scoped member did not
remove its historical reference: installation deletion still returned 409 for
that referenced workspace. This verifies authorization and dependent-record
preservation, not a purge mechanism. Existing workspaces were not modified.

The throughput-control integration was checked with actual workspace owner and
viewer tokens on a temporary key. For RPM, concurrency and TPM independently,
the viewer could read current policies and histories but both set-zero and
remove-limit writes returned 403 without changing the limit or revision. The
owner set zero and then explicit null; each policy independently advanced through
string revisions `1` and `2`, with matching history. Snapshot timestamps may
change on reads without a policy edit. No inference attempt was created and the
Demo key's policies were untouched; temporary access was revoked. This is backend
role verification, not rendered frontend authorization qualification.

### Stripe notification rejection boundary

`POST /payments/stripe/notify` is now included in the handler-generated contract. It is a signed server callback, not a customer funding command. A current-input run against an isolated native gateway and PostgreSQL observed HTTP 502 without Stripe configuration, HTTP 400 for an unsigned notification after configuring a fresh local webhook secret, and HTTP 413 for a body exceeding 262144 bytes. Independent database queries found no top-up orders and no balance entries afterward. No signed paid event or external payment was fabricated; successful settlement is not verified by this run. The existing development database and merchant configuration were unchanged.

### Repeatable native checkout verification

Build the current gateway with `cargo build --release -p niu-gateway`, put PostgreSQL `initdb`, `pg_ctl`, and `psql` on `PATH`, then run `python3 scripts/native-payment-checkout.py`. Use `--gateway PATH` for a different freshly built binary. Run as a non-root user, as required by PostgreSQL. The command creates and removes its own PostgreSQL cluster, encryption identity, merchant secret and gateway process; it does not read saved development credentials or connect to an existing database.

The current-input HTTP flow rejects an unsupported disabled payment method, saves an EPay configuration without returning its secret, creates a CNY 12.34 pending checkout, independently checks its URL parameters and signature, rejects a conflicting idempotent intent, and reads/replays the identical order after restarting the gateway. Independent SQL verification requires exactly one order, zero settlements and zero balance entries. A local execution completed these checks. Checkout URLs use reserved example domains and are never followed; no paid notification is generated. This does not establish external payment, successful settlement or overall release readiness. The command is deliberately separate from container qualification and fixture suites.

The native checkout command also sends eight synchronized HTTP creation requests for the same new intent. A current run returned the identical order to all callers, independently retained exactly one database order, rejected disabling the configuration while that order was pending (HTTP 409), and confirmed the configuration remained unchanged. Restart then preserved the original order and replay result. This checks concurrent idempotency for local EPay checkout creation, not external payment throughput.

The same native command now creates temporary company and workspace actors through the actual operator API. A current run confirmed company-owner order recovery, denied foreign-company owners, company viewers and workspace-only owners access to checkout list/detail/creation/method discovery, and checked that denied responses omitted the saved checkout URL. It also denied platform merchant-configuration reads to all these ordinary actors, including the company owner. Independent final SQL checks still found one pending order and no financial entries. These are API authorization checks; rendered role-specific workflows remain separate.

### Current backend build revalidation

On 2026-10-10, a fresh release gateway built from `590528d` (binary SHA-256 `17c77b614a9a848db97e27e2770d304c028bb0e5cb0f4251e2344c060d097ba8`) completed isolated current-input HTTP and independent database verification for native checkout concurrency/restart/role isolation, workspace mutation authorization, Supplier member activation/revocation persistence, and Stripe callback rejection. A separate isolated run made real owner-funded upstream structured and streaming completions and independently checked configured customer charge/debit arithmetic, released reservations, credit-bound negative balance, reconciliation, statement attribution, key spending enforcement, idempotent balance refund and restart preservation. No payment receipt or commercial Supplier qualification was created. These observations qualify the exercised backend paths only; external payment settlement, complete video billing, rendered workflows and full release acceptance remain open. The shared development runtime was not restarted.

### Throughput history pagination under new writes

A current-input HTTP run created 45 revisions independently for RPM, concurrency and TPM on a temporary workspace key. Each history returned pages of 20, 20 and 5 in strictly descending revision order. After reading the first page, an additional revision was written; the existing `before_revision` cursor continued through the original older records without duplicates or omissions, while a fresh first page included the new revision. Independent SQL compared every returned revision and configured value with the saved history. A cursor before revision 1 returned an empty list. No inference attempts were created; the temporary key was revoked and existing key policies were untouched. This verifies the backend pagination consumed by the limit-history UI, not its rendered interaction states.

### Rotated-key policy history continuity

A current-input HTTP run configured zero RPM, concurrency and TPM limits on a temporary key, rotated it, and compared each replacement policy and full history with the original. The original credential returned 401; the replacement returned 429 with the inherited configuration. Independent SQL found one shared spending root and no inference attempts. Updating each policy through the replacement continued revisions from 1 to 2, and both key IDs returned the same history. Both credentials were revoked afterward. This demonstrates configuration/history continuity and combined admission denial; the single denied request does not independently qualify enforcement ordering or each limiter in isolation.

The classic EPay GET and form POST callback contracts are now generated from handler comments and published on the documentation site. With a pending checkout and enabled isolated configuration, current HTTP requests observed 400 for an empty or oversized query, 400 for a JSON POST instead of a form, and 413 for an oversized POST. Independent database checks retained the pending order with zero settlements and zero balance entries. These rejection checks do not establish successful merchant notification delivery or funding.

### Actual owner-funded batch embeddings

A current-input request through a temporary personal OpenRouter route to `openai/text-embedding-3-small` completed `POST /v1/embeddings` with HTTP 200. Two distinct nonce-bearing input strings produced two correctly indexed, distinct 1536-dimensional float vectors with finite components and positive reported token usage. Independent SQL found one persisted attempt and no customer charge. The temporary key was revoked and the temporary route/credential disabled; the original encrypted credential hash and revision were unchanged. This qualifies the exercised personal float-encoding batch path and response structure, not semantic retrieval quality, custom dimensions, base64 encoding, customer-priced embedding settlement or commercial supply.

### Actual embedding charge and credit flow

A separate isolated native run exercised customer-priced `openai/text-embedding-3-small` batches using explicit internal verification rates and an approved test credit limit, with the owner-funded upstream credential. Zero credit initially refused admission with no attempt. Two real batches, separated by a gateway restart, returned indexed finite vectors and positive input-token usage. Independent arithmetic used the reported input tokens and configured input rate (zero output tokens); SQL matched customer charges, balance debits, configured upstream expenses and saved attempt token counts. Reservations were released, available credit and reconciliation totals agreed, statement totals matched, the key spending cap denied an additional request without an attempt, and replaying a balance refund produced only one refund entry. Another restart preserved the ledger without duplicates. No funding receipt, external payment or commercial Supplier qualification was created. This verifies the exercised embedding billing path with internal rates, not merchant settlement or a commercial offer.

For the same upstream embedding model, a subsequent current-input personal-route run explicitly enabled custom dimensions and base64 capability, then submitted two real batches requesting 64 dimensions: one float response and one base64 response. Both completed with HTTP 200, correctly indexed distinct vectors and positive reported token usage. Independent strict base64 decoding yielded exactly 256 bytes per vector, decoded as 64 finite little-endian float32 values. SQL found exactly two attempts and no customer charge; temporary credentials/routes were disabled or revoked and the original encrypted credential was unchanged. This verifies these two encoding/dimension combinations for this model, not all Provider/model capability declarations.

### Actual Responses charge and credit flow

An isolated current-input run exercised `/v1/responses` with the personal upstream credential and explicit internal rates/credit: one buffered completion and one streamed completion after restarting the gateway. Both returned the requested fresh marker; the stream contained exactly one `response.completed` terminal event. Independently calculated input/output token charges matched persisted customer charges, debits and configured upstream expenses. Zero-credit admission, released reservations, available credit, reconciliation, statement attribution, key spending refusal, idempotent balance refund and another restart were checked against actual HTTP results and SQL artifacts. No payment receipt or commercial qualification was created. This evidence covers the exercised text Responses path, not every tool, structured-output or multimodal combination.

### Mixed-protocol concurrent accounting

An isolated current-input run issued 12 real requests through four concurrent workers: four Chat completions, four Responses completions and four embedding requests, sharing one workspace key and company account. Explicit internal tariffs and approved credit funded the accounting exercise; the upstream credential remained personal. Each response was checked for its requested marker or finite embedding vector, and independently calculated token charges matched each saved charge, debit and attempt token count. Completion left zero open customer reservations and no reconciliation discrepancies. Restart preserved exactly 12 charges and the independently summed ledger balance. No funding receipts were created. This checks the exercised mixed-protocol concurrency and ledger correctness, not throughput capacity or every streaming/limiter combination.

### OpenRouter video contract follow-up

The [official video guide](https://openrouter.ai/docs/guides/overview/multimodal/video-generation), reviewed on 2026-10-10, illustrates completed polling usage with upstream cost and BYOK metadata, not a reported billable duration. That example does not establish exact customer seconds; requested duration remains an estimate and upstream cost remains confidential procurement information. The guide also documents cancelled and expired webhook events. The current polling decoder maps pending/running/completed/failed states and leaves other values unknown; explicit compatibility for cancellation/expiry remains open and must preserve unresolved financial liability unless execution/usage evidence justifies settlement or release. No actual cancellation/expiry observation was produced by this documentation review, and webhook event names alone are not proof of the polling response contract.

The [official polling tutorial](https://openrouter.ai/blog/tutorials/video-generation-api/), subsequently reviewed on 2026-10-10, explicitly lists `cancelled` and `expired` as terminal polling states. The OpenRouter decoder now recognizes both, preserves their distinct status in safe query metadata, and maps them to the existing failed-generation lifecycle so automatic polling can stop. This does not establish zero usage, settle a charge or release financial reservations. Compilation and formatting were checked; no actual cancelled/expired upstream job was available for current-input end-to-end verification, so that runtime behavior remains unverified. The shared gateway has not been restarted with this change.

The embeddings handler now generates its request/response contract and both supported authentication alternatives. A current-input batch using only `X-Niu-API-Key` (no Authorization header) returned HTTP 200 with validated vectors and positive token usage; SQL found one attempt and no customer charge. Temporary credentials were revoked/disabled and the original encrypted credential was unchanged. The documentation site renders this operation and the named authentication scheme definitions.

### One key request-rate window across protocols

An isolated current-input run set one key to three requests per minute, then completed one actual Chat, one Responses and one embedding request. The next Chat request returned HTTP 429 with `key_request_rate_exceeded`; independent SQL still contained only three attempts. A revision-checked update to null removed the limit, after which three concurrent requests completed across the same protocols. All six independently calculated charges matched debits and saved token counts, with zero open holds or reconciliation discrepancies; restart preserved the exact total. This verifies shared cross-protocol request-rate admission and explicit policy recovery for the exercised window, not elapsed-window rollover or every limiter combination. No funding receipts or commercial qualification were created.

### Concurrent partial charge refunds

An isolated current-input run created two real credit-backed Chat charges, then sent two simultaneous partial refunds against the first charge with distinct idempotency keys. Each requested more than half the original amount, so together they would exceed it. Exactly one returned 200 and one 409. Replaying the successful request retained one refund row; refunding the exact remainder brought the sum to the original debit, and another one-nanounit refund returned 409. Independent SQL preserved the original customer charges and matched the final ledger balance. The key allowance API reduced committed spending to the second charge and restored exactly the refunded amount as remaining allowance. This verifies the exercised internal balance-refund race, not an external merchant refund or funding reversal. No funding receipt was created.

The generated handler reference now includes workspace billing overview, customer
text tariff publication, usage invoice creation and invoice lines. These remain
existing implemented routes: installation authority is required for tariff and
invoice writes; scoped readers can inspect customer billing. A current-input
isolated run checked actual HTTP response types and required fields against the
generated schemas while independently reconciling three upstream completions
with PostgreSQL charges, cache quantities and balance debits. Repricing and
restart preserved the historical invoice response. Media invoice pagination and
external payment settlement were not exercised by that run.

Company balance, approved-credit policy, charge reconciliation, balance reversal
and transaction-page operations also come from handler annotations. Available
funds subtract outstanding liabilities, including known media amounts above an
original reservation, rather than only the original holds. A current-input run
with two actual model completions checked these HTTP response types and required
fields against the generated contracts. After concurrent partial refunds,
idempotent replay, the remainder refund and restart, transaction counts, kinds
and signed amounts matched independent ledger reads. This did not exercise a
multi-page ledger or externally settled funding reversals.

Supplier API-key configuration list/create/update operations now share generated
handler schemas, including their successful metadata envelopes, write-only
credential fields and integer revision preconditions. The handlers authorize
installation administration or explicitly granted platform administration.
A current-input two-configuration Supplier run checked actual response types,
required fields and closed-object fields against those schemas, then verified
four real model calls and independent ledger records across credential editing,
disablement and restart. Both configurations used the owner's same authorized
upstream secret; this does not qualify distinct upstream accounts or commercial
Supplier supply.

Supplier model-binding list/upsert operations and their shared capability schemas
are generated from the handlers. Route prices remain confidential platform
procurement configuration; customer selling tariffs use the billing API.
A current-input dual-configuration run checked actual model response fields
against the generated schemas. After four real calls, omitting pricing retained
the prior value, a stale revision returned 409, and explicit null cleared it.
Independent PostgreSQL reads confirmed the new revision and null price; restart
preserved the result and the existing customer debits remained unchanged.

Workspace API-key list, issuance, rotation and revocation now use generated
handler contracts, including the one-time secret envelope and no-store header.
`last_used_at_ms` explicitly permits null with OpenAPI 3.1 type syntax; a fresh
key has no dispatch timestamp. Current-input management calls checked response
field types, required fields and secret-cache headers. Rotation retained shared
policy history and spending identity; the old secret returned 401, inherited
zero limits denied the replacement before dispatch, and repeated revocation
remained idempotent. Metadata returned no token or token hash. Independent reads
confirmed one spending root and no attempts for the temporary keys, which were
revoked after the run. This does not qualify all key-policy combinations.

Key management operations document the shared application error envelope:
`error.type`, safe `message`, null `param` and numeric HTTP `code`. Current-input
HTTP calls verified authentication denial, invalid grants and revoked-key rotation
against that schema without dispatching a model request. A malformed UUID path
returned plain text with HTTP 400; that alternate content type is documented.
Clients must inspect HTTP status and content type before decoding an error body;
the shared schema does not promise that framework or intermediary errors are JSON.

Supplier model discovery, explicit catalog refresh and connection checks now use
handler-generated contracts. A current-input isolated run queried the actual
OpenRouter catalog and confirmed the mapped model was listed. Discovery/check
left the local mapping unchanged. Explicit refresh updated descriptive metadata
once while retaining prices, alias, upstream identity and declared capabilities;
an immediate repeat changed no mappings. PostgreSQL revision and restart reads
matched. No inference attempts or ledger entries were created. A successful
catalog check is not evidence of generation entitlement, available quota or
successful inference.

The workspace request-log list now uses a handler-generated contract, including
filters, sort order, cursor, full-filter summary, customer charges, safe failure
metadata and nullable phase timing. A current-input read paginated two retained
actual embedding attempts one at a time. Their order, total summary count and
prompt tokens matched independent PostgreSQL reads. Responses used no-store,
retained owner-funded/null-charge semantics and contained no procurement or
credential fields. This observation does not qualify every filter, timing state
or error category; no new inference was dispatched for the log read.

### Low-balance warning contract and current-input authorization

`setCustomerBalanceWarning` is now generated from the implemented Rust handler,
including company/currency path parameters, exact decimal-string amounts,
revision checking, nullable/omitted disable semantics and response requirements.
The billing OpenAPI entrypoint references that generated operation; the JavaScript
SDK already exposes the corresponding method. This is a warning preference,
not a notification delivery configuration or a credit-policy editor.

A fresh isolated native HTTP run verified company-owner update and disable,
stale-revision conflict, company-viewer and workspace-only-owner denial,
rejection of a supplied credit-limit field, and denial of the installation-only
credit-policy operation to the company owner. Restart retained the disabled
warning, unchanged approved credit and zero balance. Independent database reads
found no balance entries or inference attempts. No funding receipt or external
payment was created; original development data and credentials were preserved.

### Request envelope rejection consistency

Text inference payload capture now preserves HTTP 413 for a request over the
1 MiB body limit instead of misclassifying the limit as HTTP 400. Other body-read
failures remain invalid requests. Public Chat, Responses and Embeddings and
selected-key dashboard Chat document the same 413 behavior; framework rejections
may have a plain-text body. Video intent saving retains its separate 64 KiB cap.

A current-input native HTTP run exercised all five routes at the exact byte limit
and one byte above it, with Content-Length and chunked transfer, and with capture
both enabled and disabled. Oversized bodies returned 413; exact-limit JSON reached
required-field validation. Independent database inspection found no attempts,
financial entries or saved intents. This verifies bounded rejection and status
semantics, not acceptance of a maximum-sized model prompt or a memory-load SLO.

### Supplier credential startup coverage

Startup now validates retained inference credentials directly from the Supplier
registry in pages of 100 rather than enumerating model routes. Disabled Suppliers
and Suppliers with no model mappings are included. Missing-key startup protection
is retained, and this read-only validation neither rotates keys nor rewrites
ciphertext. This does not implement master-key rotation for payment, asset, OAuth
or media records.

An actual isolated startup with a saved credential and no model mapping exposed
the previous omission: an incompatible master key did not stop the process. After
the fix, a current native run created 101 unbound credentials through management
APIs, including disabled Suppliers. Wrong and missing master keys prevented
startup. A native database fault injection moved an actual ciphertext to another
Supplier identity on the second page; startup rejected it. Restoring the exact
original ciphertext and key restored readiness and authenticated Supplier listing.
Independent checks retained every ciphertext hash and revision. A separate
read-only cryptographic preflight verified the original development registry
without printing credentials or changing rows.
