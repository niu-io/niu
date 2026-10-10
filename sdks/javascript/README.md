# Niu TypeScript SDK

The `@niu-io/sdk` package is a small, fetch-based client for Niu's OpenAI-compatible API.

```ts
import { NiuClient } from '@niu-io/sdk';

const niu = new NiuClient({
  apiKey: process.env.NIU_API_KEY!,
  baseURL: 'https://gateway.example.com/v1',
});

const models = await niu.models.list();
const completion = await niu.chat.completions({
  model: 'fast',
  messages: [{ role: 'user', content: 'Summarize this report.' }],
});
const response = await niu.responses.create({
  model: 'fast',
  input: 'Summarize this report.',
});
const embeddings = await niu.embeddings.create({
  model: 'embedding',
  input: ['A short text to embed.'],
});
```

## Verify client setup

The packaged `examples/verify-inference.mjs` checks key-scoped model discovery, one nonstreaming text request and one completed text stream. Set `NIU_API_KEY` to a key generated in your workspace's Keys page, using a private environment. For the configured local development demo:

```sh
NIU_BASE_URL=http://localhost:2566/v1 \
NIU_MODEL_ALIAS=google/gemini-2.5-flash \
node node_modules/@niu-io/sdk/examples/verify-inference.mjs
```

Use your installation's `/v1` endpoint and an enabled text model supporting streaming. The example makes two real requests with at most 64 output tokens each; they may incur your configured customer charges. It requests payload opt-out, leaves metadata collection enabled, and prints completion and reported usage without prompts, responses or internal identifiers. Missing usage stays null. Discovery errors, unavailable models and incomplete streams fail without retries; unsupported protocols and other models require separate qualification.

Embedding calls use the configured OpenAI-compatible route and are available only when that route explicitly enables embeddings. Optional dimensions and base64 output must also be enabled on the route. The SDK does not add retries.

`chat.completions()` types OpenAI-compatible function tools, tool choices, JSON response formats, tool-call results, and usage. The selected route must enable the matching server-side capability. Niu returns tool requests to the client; the application remains responsible for reviewing and executing them. Niu checks structured JSON against the supplied schema within its documented offline validation bounds; invalid schemas are rejected before dispatch, and nonconforming outputs fail delivery.

`responses.create()` supports the documented non-streaming text subset of the OpenAI Responses API when the selected route enables `supports_responses`. It accepts a string `input`; multimodal inputs, tool calls and conversation state are not included in this subset. Use `responses.stream()` with the same text input to iterate Responses SSE events. The iterator ends at `response.completed` or `response.incomplete`; missing terminal evidence is an error. The SDK passes `AbortSignal` through to the request.

The SDK also provides a metadata-only task recorder. It is independent of the inference client and does not capture prompts, model responses, source code, tool arguments, or tool output.

Use `chat.completions()` for a JSON response and `chat.stream()` for SSE:

```ts
const controller = new AbortController();
for await (const chunk of niu.chat.stream({
  model: 'fast',
  messages: [{ role: 'user', content: 'Hello' }],
}, { signal: controller.signal })) {
  console.log(chunk);
}
```

The iterator requests provider usage events. Breaking the loop cancels the response body; `AbortSignal` also cancels the underlying fetch. Cancellation does not prove that the provider stopped execution or incurred no cost. Missing terminal events, invalid JSON and events exceeding the client's 65,536 UTF-16-unit buffer limit throw errors. The SDK does not retry or reconnect a stream automatically.

## Server-side account and quota collection

`NiuAuthClient` exchanges an existing member's password for a scoped session
and revokes that session on sign-out. Production password login requires the
server's `NIU_AUTH_PUBLIC_ORIGIN` configuration and HTTPS; member provisioning,
dashboard integration and self-registration are separate from this client.

```ts
import { NiuAuthClient } from '@niu-io/sdk';

const auth = new NiuAuthClient({ baseURL: 'https://niu.io/admin/v1' });
const signedIn = await auth.signIn({ email: memberEmail, password: memberPassword });
// Store signedIn.token securely in the calling application's session layer.
// It grants the member's existing permissions, never installation access.
await auth.signOut(signedIn.token);
```

Pass `{ signal }` as the final argument for cancellation. Passwords are sent
unchanged; the SDK retains no password or token, sends no cookies, disables
request caching and rejects redirects. Neither operation retries automatically.
A network failure leaves sign-out uncertain; retry with the same token before
assuming revocation. HTTP 401 means the supplied session is already unusable;
other sessions remain active. `NiuAPIError` preserves HTTP status and request
reference, including 429 sign-in throttling. The SDK does not implement browser
session persistence or a cookie-based login workflow.

`auth.changePassword(memberToken, { current_password, password }, { signal })`
changes only the signed-in member's password. It requires current-password proof,
accepts no member target or email, and sends a PUT without retries. New passwords
must have at least 15 characters and at most 1024 UTF-8 bytes. Success returns
`sign_in_required: true` and revokes all sessions for that member; discard the old
session credential and sign in again. A 409 indicates that another password
change raced verification; the SDK does not overwrite or retry it.

`NiuAdminClient` is separate from the inference client and requires a server-side administrative credential with the relevant workspace permissions. Keep that credential on the server. These methods do not poll providers, refresh credentials or execute inference.

```ts
import { NiuAdminClient } from '@niu-io/sdk';

const admin = new NiuAdminClient({
  adminToken: process.env.NIU_ADMIN_TOKEN!,
  baseURL: 'http://localhost:2555/admin/v1',
});
const scope = {
  organizationId: process.env.NIU_ORGANIZATION_ID!,
  projectId: process.env.NIU_PROJECT_ID!,
};
const accounts = await admin.listAccounts(scope);
// Account listing currently returns at most 1,000 entries.
for (const account of accounts.data) {
  const evidence = await admin.quota(scope, account.id);
  console.log(account.provider, account.billing_mode, evidence.data);
}

let activity = await admin.listGatewayActivity(scope, { limit: 100 });
for (;;) {
  for (const request of activity.data) {
    console.log(request.model, request.prompt_tokens, request.customer_charge_nanos ?? 'charge unknown', request.customer_charge_currency);
  }
  if (!activity.next_cursor) break;
  activity = await admin.listGatewayActivity(scope, { limit: 100, after: activity.next_cursor });
}
```

Gateway activity is automatically retained metadata for requests admitted by Niu. Pages are scoped to the organization and workspace, newest first, and the cursor reads older entries; traversal is a live view rather than a cross-page snapshot. Token counts and costs are nullable decimal strings, so unknown usage or cost must stay unknown. Request and response bodies are not included.

Summary `average_duration_ms` is the rounded mean of complete gateway request totals over the full filtered range. Incomplete phase measurements are excluded from both the average and `timing_count`; historical rows without phase timing are excluded because their dispatch interval has a different boundary. P50/P95/P99 use the same complete gateway-body samples and disclose their sample count and boundary. No eligible samples returns null. For individual records, prefer `timing.total_ms` only when `timing.complete` is true. `duration_ms` is the narrower legacy attempt interval and can differ from the full measured total. An interrupted interval remains observed timing, not completed latency.

Summary latency percentiles use completed gateway body-consumption durations across the full filtered range. `sample_count` excludes missing and incomplete timing measurements; no samples produce null P50/P95 values. These durations do not measure client receipt time or upstream-only generation time.

Installation administrators can read a configured adapter's business association with `getSupplierAssociation(configurationId)` and set it with `associateSupplier(configurationId, supplierId, expectedRevision)`. The existing `/vendors` API path is preserved. Association requires the current configuration revision; conflicts propagate without retries or reassignment. The read returns a Supplier name or null, without configuration credentials. Customer and Supplier credentials cannot use these installation administration operations.

`publishSupplierRates(supplierId, rates)` publishes agreed Supplier input/output rates through the installation-only `/providers/{provider}/offers` compatibility contract. `prompt_rate` and `completion_rate` are exact decimal integer strings in currency nanounits per million tokens; for example, USD `400000000` means $0.40 per million tokens. Publication creates an immutable revision and clears the offer's prior qualification and activation. Review and qualify the new revision before enabling it for dispatch. Set `expected_revision` to null for a new offer, or to its current opaque revision identifier for an update. Stale updates conflict without changing rates. The returned revision is an opaque identifier. This operation does not publish customer tariffs, establish a discount or retry failed writes.

`listSupplierOffers(supplierId)` reads current agreed rates and their activation, qualification and route-readiness fields. It returns only offers from the installation administration response, excluding earnings and settlement records. To update a reviewed offer, pass its `revision` as `expected_revision`; never derive or increment this opaque identifier. Supplier managers can manage availability through their authorized API, but cannot publish agreed rates through this installation-only method.

`listChatSessions(scope)` reads the authenticated owner's latest 100 active saved sessions in a workspace. `listArchivedChatSessions(scope)` reads the corresponding archived history. `setChatSessionArchived(scope, sessionId, true)` archives and `false` restores a conversation; archive state is stored by the backend and survives autosave. Read access is required to list; write access is required to archive or restore, and missing or foreign-owner records return 404. These methods accept cancellation options and do not retry writes automatically. `deleteChatSession(scope, sessionId)` removes that owner's session durably; repeated deletion is safe. Workspace write access is required, and request accounting and billing records remain intact. Browser caches are not the source of truth for this history.

Supplier review workflows use installation-only `qualifySupplier()` and `qualifySupplierOffer()`, followed by an explicit `setSupplierOfferActive()` call under installation or Supplier owner/admin access. Reviews contain lowercase SHA-256 digests of independently reviewed evidence and a future expiry; offer reviews pin the current immutable rate revision and protocol-matrix version. The SDK does not establish supply rights from a digest or upload the underlying private agreement. Revocation methods `revokeSupplierQualification()` and `revokeSupplierOfferQualification()` record a reason digest and pause affected supply. Qualification, activation and revocation are separate operations without automatic write retries. Personal use of an owned upstream key is distinct from commercial Supplier qualification; do not record fabricated resale evidence to enable a personal test connection.

`assignPersonalCredentialOwner(configurationId, organizationId, expectedRevision)` assigns an installation-managed upstream credential to one immutable account owner. It requires installation administrator access and the current credential revision. Exact retries succeed without another assignment event; assigning another owner or a commercially qualified credential fails. It does not grant funds or activate Supplier offers. The owning account's workspace keys can discover and use its enabled models, subject to grants and guardrails, without Niu prepaid charges. The credential owner pays the upstream directly. These assignments are separate from Supplier memberships and commercial qualification, and the SDK does not retry writes automatically.

`exportChatSession(scope, sessionId)` reads one saved conversation directly, including older conversations outside the latest-100 list. It requires workspace read access and the same personal owner. The versioned `niu-chat` JSON contains title, creation time, ordered prompts, model response content/status and saved attachment content. Legacy single-turn sessions become one turn. Internal identifiers, settings, diagnostic errors, token/timing metrics and accounting fields are excluded. Conversation text and attachments are intentionally included; review their content before sharing the export. This does not export Logs or establish customer charges.

`saveChatSession(scope, sessionId, session)` persists optional ordered `turns` alongside the current prompt/results. `chatBranchMessages(turns, model)` reconstructs completed user/assistant text exchanges for one model without mutating history. It omits failed, cancelled and unfinished exchanges and rejects duplicate results for the same model. Add the current user message and any system message separately. This text helper does not reconstruct attachments or tool-call exchanges.

Workspace access Guardrails use `getWorkspaceGuardrail(scope)`, `previewWorkspaceGuardrail(scope, policy, model, provider)` and `activateWorkspaceGuardrail(scope, expectedRevision, policy)`. A missing active policy reads as null; initial activation expects revision 0. Empty allowlists deny. Preview checks only the supplied model/Provider restrictions and does not establish route availability, credential eligibility, content inspection, retention or budgets. Activation requires workspace write access; stale revisions conflict without automatic retries. See the dedicated `contracts/guardrails.openapi.yaml` contract. Bounded local input inspection and buffered full-text output inspection are supported on the paths documented in that contract; Required external input checks are opt-in as described below; external output detectors and streaming output inspection remain unsupported. Key policy assignment support is described below. `listWorkspaceGuardrailHistory(scope, beforeRevision)` returns up to 100 immutable revision metadata records with an exclusive `next_cursor`; it excludes policy content and internal actor identifiers. `getWorkspaceGuardrailRevision(scope, revision)` reads the exact saved policy, including its content rules, for review. `rollbackWorkspaceGuardrail(scope, expectedRevision, targetRevision)` creates a new active revision from the preserved target, retains history and rejects stale heads without retries.

The compatibility field `projectId` identifies a Niu workspace. To investigate a
specific period, model or key, pass `fromMs` (inclusive), `toMs` (exclusive),
`modelAlias`, `apiKeyId` or `status` to `listGatewayActivity`. Its `summary`
covers all matching records, independently of pagination. Customer charge and
token quantities remain decimal strings; avoid converting them to floating
point. Supplier expenses and platform margins are not workspace charges.

`summary.charges_by_model` and `summary.charges_by_key` group customer ledger
amounts separately by currency, across the full matching range. They preserve
exact nanos and include charged, unresolved, unpriced and not-charged request
counts. Unsettled amounts and currencies remain null; never add different
currencies together or treat missing amounts as zero.

`request.timing` contains observed phase offsets or null for unavailable
measurements. Interrupted responses retain an incomplete interval; first
output remains null for nonstreamed requests.

Request queries and CSV export accept `httpStatus: 502` (any integer from 100 to 599) or `httpStatus: 'unknown'`, independently of Provider execution filters. `status: 'delivery_failed'` selects recorded delivery HTTP errors (400–599). `summary.delivery_statuses` counts known codes and a nullable unknown category across the full range; it does not infer success or failure from missing data. Failed delivery may still have completed Provider execution and a customer charge.

Request listing and CSV export accept `sort: 'time_desc'` (default), `'time_asc'`, `'latency_desc'`, `'input_desc'` or `'output_desc'`. The backend sorts the full filtered range, with unknown measurements last and time/ID tie breaks. Keep sort and filters unchanged across cursor pages. This is a live traversal; new requests or measurements completing between pages can move rows. CSV reads the range in one database statement.

`exportGatewayActivity(scope, filters, { signal })` returns the full filtered range as a CSV string. It accepts the same `fromMs`, `toMs`, `modelAlias`, `apiKeyId` and `status` filters, with no pagination. Workspace read permission is required; inference API keys cannot export Logs. HTTP 413 raises `NiuAPIError` with guidance to narrow ranges above 10,000 requests, without a partial file or automatic retry. Exact customer amounts remain decimal digits, unknown values are blank, and internal IDs, payloads and Supplier procurement fields are excluded. Formula-like text receives a leading apostrophe. Store exported customer data privately.

The appended `Cached input tokens` and `Reasoning output tokens` columns preserve exact reported subsets. Blank means unknown, while `0` means an explicitly reported zero. They are already included in the corresponding input/output totals; adding them again would double count tokens.

```ts
const csv = await admin.exportGatewayActivity(scope, {
  fromMs: Date.UTC(2026, 8, 1), toMs: Date.UTC(2026, 9, 1),
  modelAlias: 'fast', status: 'confirmed_completed',
});
```

`getRequestPayload(scope, attemptId)` reads separately retained diagnostic
content when capture was enabled and it has not expired. It returns
`{ data: null }` otherwise. `deleteRequestPayload(scope, attemptId)` requires
workspace write permission and deletes content without deleting accounting
records. These methods do not enable capture or recover expired content.

Use `createAccount(scope, input)` to register account metadata and an `env:` or `secret:` credential reference. Registration is not credential verification. Use `observeQuota(scope, accountId, observation)` with evidence obtained by an authorized collector. `remaining` and `maximum` are decimal strings or null, never floating-point values. Timestamps are safe-integer milliseconds. The server validates intervals, quantity bounds and tenant ownership. Identical observations may be explicitly resubmitted; conflicting evidence returns `NiuAPIError` with status 409. The SDK does not retry automatically and rejects redirects. Every method accepts an optional `{ signal }` for cancellation.

The API reports capacity separately from monetary charges. Missing or stale quota evidence does not mean zero remaining capacity. Native provider collection remains unfinished. Workspace-scoped collector credentials are available for quota ingestion.

## Quota-only collectors

Provision a collector key using `admin.issueCollectorKey(scope, { name: 'quota collector', ttl_seconds: 86400 })`. Save its returned ID for `admin.revokeCollectorKey(scope, id)` and deliver its one-time token to the collector through your secret manager. Key issuance is an administrative operation; do not place the installation admin token in the collector.

```ts
import { NiuCollectorClient } from '@niu-io/sdk';

const collector = new NiuCollectorClient({
  collectorToken: process.env.NIU_COLLECTOR_TOKEN!,
  scope: {
    organizationId: process.env.NIU_ORGANIZATION_ID!,
    projectId: process.env.NIU_PROJECT_ID!,
  },
});
// providerObservation must come from your authorized provider integration.
await collector.observeQuota(accountId, providerObservation);
```

The collector interface exposes only `observeQuota`. Its scope is copied at construction, and the server enforces project ownership, expiry and revocation on every ingestion. It cannot query quota or register accounts; use the admin client in the operator application for those operations. No retries, polling or credential refresh happen implicitly.
## Runnable usage investigation example

After building the SDK, run `node examples/inspect-usage.mjs` from the SDK directory. Set `NIU_ADMIN_TOKEN`, `NIU_ADMIN_BASE_URL` (including `/admin/v1`), `NIU_ORGANIZATION_ID`, and `NIU_WORKSPACE_ID` through the environment. For local development, the base URL is `http://localhost:2566/admin/v1`. Optionally set `NIU_MODEL_ALIAS` to filter requests, or `NIU_REQUEST_STATUS=output_withheld` to investigate recorded blocked/indeterminate output. Withheld output does not cancel incurred usage or customer charges.

Use an authorized server credential; an inference key cannot read the workspace feed. The example traverses pagination and prints aggregate usage and customer charges without credentials, payload content, or internal identifiers. Missing customer rates remain unpriced. Each summary reads one consistent database snapshot, including its histogram, usage breakdowns and customer charges. The traversal uses the first page’s summary; concurrent requests can change the number traversed.

The output also includes recorded HTTP-status coverage and gateway-body latency percentiles with their sample count. Missing metadata remains null; a recorded HTTP status does not establish Provider completion. Repeated pagination cursors and authorization failures stop the example without printing a successful partial summary.

`summary.token_categories` reports cached-input and reasoning-output subset sums as exact strings, alongside separate reported/unknown request counts for each category. A sum describes only requests with valid reported counts; it is null when none reported that category. Explicit zero differs from unknown. Request rows expose nullable `cached_input_tokens` and `reasoning_output_tokens`. Categories do not add to input/output totals and do not establish category-specific billing rates or savings.

## Request payload retention

The current gateway retains request and sanitized response content in Logs until 24 hours after the original request creation time by default. Expired content is hidden immediately on reads; background cleanup removes it in bounded batches. A late duplicate capture cannot restart the retention window. To omit content for an individual call, pass `{ logPayloads: false }` as the request options to `chat.completions`, `chat.stream`, `responses.create`, or `embeddings.create`. This overrides the client’s default `x-niu-log-payloads` header without changing request metadata collection.

```ts
const response = await client.chat.completions({
  model: 'fast',
  messages: [{ role: 'user', content: 'Summarize this private document.' }],
}, { logPayloads: false });
```

For a client-wide opt-out, set `defaultHeaders: { 'x-niu-log-payloads': 'false' }` when constructing `NiuClient`. The gateway accepts one case-insensitive `true` or `false` header value; malformed or repeated values are rejected before inference. Known credential fields are removed from retained requests, but arbitrary secrets embedded in prompt text are not automatically redacted. The API default-content policy remains under release review.

### Customer tariffs and billing

`publishCustomerTariff(scope, rates)` publishes an explicit customer selling rate through installation administration. Rates use integer currency nanounits per million input/output tokens; pass `expected_revision: null` for a new tariff and the current tariff revision for an update. Publication creates an immutable revision for future admissions and does not reprice earlier requests. Conflicts propagate without retry. Choose customer rates explicitly: Supplier procurement rates are not a default or fallback.

Inspect shared company funds with the packaged example (no workspace selection is required):

```sh
# Set NIU_ADMIN_TOKEN privately using your credential manager.
export NIU_ADMIN_BASE_URL='http://localhost:2566/admin/v1'
export NIU_ORGANIZATION_ID='YOUR_ORGANIZATION_UUID'
node node_modules/@niu-io/sdk/examples/inspect-account-balance.mjs
# Retrieve older pages as well:
node node_modules/@niu-io/sdk/examples/inspect-account-balance.mjs --all
```

Use an organization-wide owner/admin credential. The example prints exact currency nanounits, available capacity, low-balance state and the latest 100 transactions. It does not print internal IDs or confidential Supplier fields or initiate payments. Default history is bounded to 100 entries. `--all` follows every returned cursor and fails without partial output on invalid/looping continuation or duplicate entries. History is a live view, not an atomic export snapshot or reconciliation with the separately read balance. Extremely large traversals are capped at 10,000 continuations and fail rather than claiming completion. In the dashboard, open Account menu → Settings → Billing & payments. Workspace spending limits constrain use of these shared funds; they do not create separate balances.

`getCustomerBalance(organizationId)` reads shared company funds, reservations and available capacity. `getCustomerBalanceTransactions(organizationId)` reads up to 100 signed ledger entries per page, including top-ups, charges and reversals. Its response includes `next_cursor`; pass it as `{ before: next_cursor }` to retrieve older entries until it is null. Cursors must belong to the same organization. Both require organization-wide billing authorization; workspace-only access is insufficient. Amounts remain exact decimal nanounit strings. These read methods do not initiate or collect payments.

`createCustomerTopup(organizationId, { amount_nanos, payment_method, idempotency_key })` creates or explicitly replays a company top-up through the configured merchant. The initial integration supports CNY amounts in whole cents and an existing CNY account; no currency conversion or account creation occurs. Use exact nanounit strings and preserve the same UUID idempotency key after any uncertain response. There is no automatic retry. Only explicitly enabled merchant methods are accepted; the SDK does not claim their live qualification.

`getCustomerPaymentMethods(organizationId)` reads checkout availability and configured method codes without contacting the payment service. Missing integration or CNY account returns an explicit unavailable reason and no choices. An available result does not grant write access or guarantee collection; top-up creation rechecks its requirements.

`listCustomerTopups(organizationId, { before })` recovers backend-owned checkout history across browsers. Each page has at most 100 orders and a nullable `next_cursor`; pass that cursor as `before` for older orders. Records include creation dates, saved status and pending checkout links. Foreign or missing cursors fail rather than reading another company. The history is a live view; refresh to see new intents. Keep routing/cursor IDs out of product labels.

Run `node examples/inspect-topups.mjs --all` from an installed package with `NIU_ADMIN_BASE_URL`, `NIU_ADMIN_TOKEN` and `NIU_ORGANIZATION_ID` configured. It reads checkout availability and saved history without creating orders or querying the merchant. Output preserves exact customer amounts and dates while omitting routing IDs, checkout URLs and confidential fields. Without `--all`, it reads the latest 100 orders. Malformed responses or continuation fail without claiming successful partial recovery. This example does not verify external collection or settlement.

`getCustomerTopup(organizationId, orderId)` reads durable `reconciliation_required`, `pending`, `paid` or `closed` status without an upstream query. Pending status can provide the saved checkout URL; paid and closed status withhold it. Closed orders cannot also be funded or reissued under the same intent. Browser return navigation does not establish payment. Keep credentials server-side and internal identifiers out of product displays. Checkout, merchant callbacks and real settlement still require end-to-end release qualification.

`setCustomerBalanceWarning(organizationId, currency, { warning_threshold_nanos, expected_revision })` updates an existing company's warning threshold. Use exact nonnegative currency nanounit strings up to 9223372036854775807, or null to disable the warning. The expected revision must be an exact nonnegative string below 9223372036854775807; numeric coercion is rejected. Organization-wide owner/admin write access is required; stale revisions fail. This preference cannot change approved credit or funds and does not enable email/SMS delivery.

`getCustomerBilling(scope)` reads the workspace-authorized customer balances, current tariffs and invoice history. Amounts and counts remain decimal strings for exact arithmetic. `unresolved` counts requests still awaiting billing evidence; `unpriced` indicates absent selling tariffs, not an agreed zero rate. Confirmed nonexecution does not create a charge or block invoice closure. The backend enforces workspace access and excludes procurement costs and margins. Keep administration credentials server-side.

Authenticated `listModels()` responses include `customer_pricing` when the key's workspace has a current selling tariff. It contains `currency`, immutable `revision`, `unit: "nanounits_per_million_tokens"`, and exact string `prompt_rate` / `completion_rate` amounts. A null value means no selling tariff is configured; it does not mean free inference. Supplier prices are never substituted. The revision advertised by discovery can change before a request: admission pins the tariff actually used for that request.

`getKeyGuardrail(scope, keyId)` reads a key's preserved policy revision and current assignment revision. `assignKeyGuardrail(scope, keyId, policyRevision, expectedAssignmentRevision)` assigns a validated policy from the same workspace to an active key. Pass zero for a first assignment; updates require its current assignment revision. Stale writes conflict without automatic retry. Workspace readers can inspect assignments; workspace write access is required to change them. Inference credentials cannot administer assignments. Assigned key restrictions intersect the current mandatory workspace policy and cannot expand it. Assignment changes retain immutable actor/policy history in the same transaction; session credentials are not recorded. Rotation preserves the assigned policy. `clearKeyGuardrail(scope, keyId, expectedAssignmentRevision)` removes only the optional key policy, retaining its incremented assignment revision and immutable history. This requires a positive current revision and sends an explicit null policy. Stale writers cannot recreate a cleared assignment with revision zero. Mandatory workspace restrictions remain enforced. `listKeyGuardrailHistory(scope, keyId, beforeAssignmentRevision)` reads up to 100 newest immutable events with readable actor/policy names and revision numbers. Use its exclusive `next_cursor` for older events. No history from before audit support is fabricated, and internal actor identifiers and credentials are excluded. The dashboard provides a read-only Assignment history view on key details, including inactive keys. Full role and large-history workflow qualification remains open.

### Synthetic input-rule tests

Run `node examples/inspect-guardrails.mjs` from the built or extracted SDK package with the same environment variables as `inspect-usage.mjs`. Optionally set `NIU_KEY_ID` to include that key’s assignment history. The example follows exclusive cursors through all recorded policy and assignment events, prints readable names and revisions, and omits rule patterns, internal identifiers and credentials. It performs only reads; no history from before audit support is fabricated.

`previewGuardrailInput(scope, input, options)` tests local regex rules against a
synthetic Chat, Responses or Embeddings request. Workspace read permission is
required. Results include `outcome`, a safe `reason`, `redacted`, `synthetic: true`
and `enforcement: false`; they contain no original, transformed or matched text.
Unsupported content returns `indeterminate`. This call neither activates rules
nor saves content nor dispatches inference. Active policies may separately include `input_rules` for live local text inspection. Cancellation signals are preserved.

After building the SDK, run the fixed synthetic example with an authorized
workspace credential:

```sh
NIU_ADMIN_BASE_URL=http://localhost:2566/admin/v1 \
NIU_ADMIN_TOKEN="$WORKSPACE_ADMIN_TOKEN" \
NIU_ORGANIZATION_ID="$ORGANIZATION_ID" \
NIU_WORKSPACE_ID="$WORKSPACE_ID" \
node sdks/javascript/examples/test-input-rules.mjs
```

### Synthetic output-rule tests

`previewGuardrailOutput(scope, { protocol, rules, response }, options)` inspects a synthetic complete Chat or Responses response with the live buffered-full local inspector. Supply 1–32 local rules. Workspace read access is required; inference keys cannot use this administration endpoint. Results contain only safe outcome metadata, `mode: "buffered_full"`, `coverage: "local_text"`, `synthetic: true` and `enforcement: false`. No original, transformed or matched text is returned or saved, no policy is activated and no inference is dispatched.

The entire synthetic request envelope is limited to 1 MiB. Original and transformed response objects are also bounded to 1 MiB; redaction expansion or unsupported tool/opaque content is indeterminate. This does not qualify streaming output or external detectors. Worker capacity and deadlines match synthetic input tests; calls preserve cancellation and do not retry failures automatically.

Using the same environment variables as the input example, run `node sdks/javascript/examples/test-output-rules.mjs`. Both examples are included in the SDK package. The output example defaults to `buffered_full`; set `NIU_OUTPUT_MODE=observe_only` to test non-enforcing observation. It prints only validated, allowlisted outcome metadata, makes no inference call and does not activate a policy. Unknown modes fail before network delivery.

`getRequestGuardrailDecision(scope, attemptId, options)` reads immutable
allowed-dispatch attribution: historical workspace/key policy names and revisions,
key assignment revision, access coverage, enforcer version and recorded time.
It requires workspace read access. A null result means no attribution was recorded;
it does not prove a request was denied or inspected for content. Current policy
changes do not rewrite earlier records. Its nullable `input_inspection` records `allowed` or `redacted`, explicit `local_text` coverage, the inspector version and `elapsed_ms`. Null means no input result was recorded, including historical requests and access-only policies. This method preserves cancellation and
returns no prompts, matched text, credentials or commercial data.

Synthetic rules may use `{ preset: 'email_v1', action: 'redact' }` or
`{ preset: 'api_key_prefix_v1', action: 'block' }` instead of `pattern`.
Use `{ preset: 'niu_api_key_v1', action: 'block' }` for Niu's issued inference-key syntax: `niu_` followed by exactly 64 lowercase hexadecimal characters. This separate preset preserves the existing prefix preset's behavior and does not prove that a matching value is an active credential. Each rule
supplies exactly one source. These are versioned syntax matches with limited
coverage; example email addresses may match and opaque/unknown-prefix secrets
may not. Preview does not activate these rules; include them in an explicitly activated policy for live controls.

`getCustomerInvoiceLines(scope, invoiceId)` reads authorized customer invoice lines. Money and token counts remain exact decimal strings; immutable rate revisions distinguish lines in the API and must not be displayed as user-facing identifiers.

`issueCustomerInvoice(scope, { from_ms, to_ms, currency, idempotency_key })` is installation-only. The half-open range covers at most 366 days. Supply a stable UUID idempotency key and preserve it when explicitly replaying the same request. Pending billing evidence or conflicting parameters produce a server error without automatic retry; the method does not submit or email an invoice.

`recordCustomerInvoicePayment(scope, invoiceId, paymentReference)` records a confirmed external payment through installation administration. It does not charge a card or transfer money. A conflicting reference is not silently overwritten. Do not invoke it for simulated payments against a real workspace.

After building the SDK, run `node examples/inspect-billing.mjs` with `NIU_ADMIN_TOKEN`, `NIU_ADMIN_BASE_URL` (including `/admin/v1`), `NIU_ORGANIZATION_ID`, and `NIU_WORKSPACE_ID`. The example only reads balances and the latest 100 invoices, checks each invoice's line totals using exact integer arithmetic, and prints periods/amounts/status without internal IDs or payment references. It does not issue invoices, record payments, or call a model. Unpriced and unresolved requests remain explicit.

`listGuardrailPreparationDenials(scope, options)` reads the latest 100 pre-admission access and local-input denials. It returns safe policy/key names, revision metadata, fixed reasons and server timestamps, with explicit limited coverage. It does not return request content or internal event/key identifiers. These decisions have no attempt; dispatch-time race denials and output inspection are not covered. Local input denials have explicit `local_input` coverage. Missing key policy metadata stays null. Workspace read access is required, and inference keys cannot read decisions.

An activated `GuardrailPolicy` may include `input_rules` using the same pattern/preset/action configuration as synthetic preview. Workspace and pinned-key rules inspect original text together; blocking wins over redaction. At most 32 combined rules are supported. Unsupported content, resource exhaustion and worker unavailability fail before dispatch. Text redaction preserves the supported protocol shape; request bounds are calculated afterward, and Logs retain transformed request content. Tools, multimodal content and opaque embedding tokens are unsupported when input rules are active. Required external input checks are opt-in as described below; windowed streaming inspection remains unsupported. Explicit full-buffered output rules are described below. Access attribution retains its separate coverage; the nullable `input_inspection` field explicitly identifies recorded local text inspection.

An activated policy can include `output: { mode: 'buffered_full', rules: [...] }` using the same local rule configuration. Workspace and pinned-key rules compose over original complete outputs before redaction. Supported textual Chat and Responses output is held until inspection completes; serialized original and transformed inspection objects are bounded to 1 MiB. Incompatible streaming, tool requests, structured-output requests and Embeddings are rejected before inference. Unsupported/oversized outputs and unavailable inspection fail closed after inference, without retrying. An explicit `observe_only` mode is also accepted for this same nonstreaming protocol subset. Observation leaves matching and indeterminate responses unchanged, records safe metadata in the separate nullable `output_observation` field, and cannot weaken an inherited buffered enforcement policy. Observation inspects original content before enforcement redaction. `previewGuardrailOutput` accepts an optional mode, defaults to `buffered_full`, and reports `clear`, `matched` or `indeterminate` for observation with `redacted: false`. External output detectors and streaming output inspection remain unsupported. Required external input checks are described below. Dashboard management of observation policies is not yet qualified. The strict supported response envelopes and remaining qualification are documented in the local inspection reference.

Blocked output does not erase Provider usage or incurred customer charges. `getRequestGuardrailDecision` includes nullable `output_inspection` with outcome, safe reason, explicit mode/coverage/version and elapsed time. Logs retain only the delivered redacted body or generic denial, not withheld original output. Null means no output decision was recorded; it does not prove content protection. No matched text or detector response is exposed.

`listGuardrailDispatchDenials(scope, options)` reads the latest 100 recorded policy exceptions across prepared/priced dispatch and rolled-back batch admission. It returns readable key/policy names, checked revisions and fixed reasons, with `latest_100_dispatch_policy_exceptions` coverage. Per-row eligibility status denials remain outside coverage. Batch events do not prove an attempt row exists. Workspace read access is required; request content, policy patterns, credentials and internal identifiers are excluded.

Request metadata includes nullable `finish_reasons`, an array of allowlisted terminal observations. Chat indexes identify choices. For nonstreaming Responses interruptions, index zero identifies the whole response: explicit `max_output_tokens` maps to `length`, and `content_filter` retains that category. Completed Responses status alone does not supply a stop reason. Missing or unsupported observations remain null. CSV appends a `Finish reasons` JSON column; a blank cell means unknown. These observations survive payload opt-out and expiry. `length` identifies a reported token-limit finish, while `tool_calls` identifies a Chat tool handoff; neither establishes task completion or successful customer delivery. Other native protocol and Responses streaming stop semantics remain outside this field's qualified subset.

### Workspace key activity

`admin.listWorkspaceKeys(scope, { signal })` reads scoped key metadata without secrets. `last_used_at_ms` is the latest durable dispatch intent in Unix milliseconds, including uncertain requests. Null means no attributed dispatch is recorded; authentication and pre-dispatch denial do not count as use. Rotation leaves the original key's history intact and starts the replacement without a dispatch record. This field does not establish upstream completion, task success or customer charges.

Run `node examples/inspect-keys.mjs` from the built or extracted SDK package with `NIU_ADMIN_TOKEN`, `NIU_ADMIN_BASE_URL` (including `/admin/v1`), `NIU_ORGANIZATION_ID` and `NIU_WORKSPACE_ID`. Use a scoped read credential where available. The example only reads metadata and prints key names, model grants, status, expiry and latest dispatch time. It omits internal identifiers and credentials. A null dispatch time with `activityAvailable: true` means no recorded dispatch; `false` means an older endpoint did not report activity. Authorization failures produce a failure exit rather than an empty key list.

### Required external input checks

`listWorkspaceDetectors(scope, options)` reads the deployment-authorized recipient descriptions for the workspace without sending request text. Descriptions declare the recipient, region, retention, processing limits, current configuration fingerprint and whether policy activation is permitted. These are administrator declarations, not verified service guarantees. The live content scope is `request_text_after_local_redaction`; endpoints and credentials are excluded.

An activated policy can include `input_detectors` bindings with the selected `detector`, exact `configuration_fingerprint` and `consent_to_external_processing: true`. Local input rules run first. Required checks receive only the supported validated textual subset after local redaction. A match, unavailable service, unsupported input or missing durable decision blocks before inference dispatch. Activation requires deployment authorization and a declared unmetered service; unknown or paid detector costs cannot activate. Changed configurations require fresh review and consent. This subset does not support external output inspection or streaming output inspection.

`listInputDetectorDecisions(scope, options)` reads the latest 100 metadata-only decisions, including pre-admission denials. Coverage is explicit; this is not a complete historical export. Results preserve safe outcomes, reasons, elapsed time and policy revisions without request text, matched text, raw service replies or credentials. Both reads require workspace read access, preserve cancellation and make no model calls. Full detector protocol, fault, privacy and performance qualification remains open.

### Durable video submission intents

Signed-in actors can save and recover a text-video request through `NiuAdminClient`.
Use a stable client-generated UUID for retries of the same immutable request:

```ts
const intentId = crypto.randomUUID(); // Persist this reference through your application flow.
const saved = await admin.saveVideoIntent(scope, intentId, keyId, {
  model: selectedModel,
  content: [{ type: 'text', text: prompt }],
});
const restored = await admin.getVideoIntent(scope, intentId);
const index = await admin.listVideoIntents(scope, { limit: 25 });
// Only after the user's explicit generation action:
const job = await admin.submitVideoIntent(scope, intentId, restored.data.revision);
```

Saving and restoring do not generate video. Recover forgotten references from the
actor-owned index; browser storage is only a cache. Unknown submission state must
retain the same intent identity. A successful submit response can still describe
an unresolved original attempt. Do not automatically create a replacement intent.
`deleteVideoIntent(scope, intentId, revision)` erases retained input without
cancelling generation or refunding charges. See the
[durable intent contract](../../docs/reference/video-submission-intents.md) for
key rotation, expiry, permissions, and revision semantics.

### Persisted video job state

`client.video.jobs.retrieve(reference, { signal })` reads durable Niu video state using the same workspace credential as inference. The reference is the Niu job UUID, not an upstream task ID. The request does not poll upstream or generate a video. Unknown submission or reconciliation status must not trigger a replacement create request. Configured text-input creation and query recovery are implemented for the documented subset; scoped dashboard results are implemented; live-channel qualification remains pending; a succeeded state alone does not establish a settled charge or available download.

Installation administrators can publish typed customer video selling schedules
with `admin.publishCustomerMediaRate(organizationId, card, { signal })`.
`CustomerMediaRateCard` specifies exact route/schema revisions, selling tariff,
discounts and independently qualified maximum liability. Quantities are canonical
rational decimal strings; numeric fields must be JavaScript safe integers.
Publication alone does not qualify commercial supply. Customer-funded text video
also requires a current qualified offer and funded liability reservation. Recovery
uses explicit refresh or the opt-in server polling worker. Company members and inference keys cannot
publish these rates. See the video job
reference and billing OpenAPI contract for current capability boundaries.


Discover configured text-video controls with `await client.video.models.list()`.
Signed-in members use `await admin.listDashboardVideoModels(scope, keyId)` without
pasting an API key secret. Current key grants, workspace/key policy, Supplier
availability and personal ownership apply. The projection excludes credentials,
upstream mappings, procurement prices and unsupported inputs/callbacks/meters.
Honor the returned resolution/ratio pairs. Discovery is not a quote or admission
guarantee; estimate and submit recheck current configuration, tariffs and funds.
`model.output` is a discriminated union: `video_tokens` pairs with
`SeedancePixelsV1`, while `seconds` pairs with `OutputSecondsV1`. Use the returned
meter instead of assuming all video is token-priced. The current native personal
OpenRouter route was read and estimated through the SDK: both responses reported
seconds, with no customer charge bound. This management-only check created no
submission preparation and does not qualify customer-funded media settlement.

List saved workspace video jobs with `await client.video.jobs.list({ limit: 25 })`.
Follow `next_before` with `{ before: page.next_before, limit: 25 }` while `has_more`
is true. Pages are bounded to 100 jobs and enforce the current key's workspace
and model grants. `created_at_ms` remains an exact decimal string. This read does
not poll or resubmit generation, and uncertain submissions remain visible.

Estimate a configured text-video request with `await client.video.estimate(request)`.
This performs one authenticated POST to `/video/estimate` without creating a job,
calling the Supplier, reserving funds or charging the account. The returned
estimated amount and independently reviewed maximum charge are exact decimal
nanounit strings. Owner-funded amounts remain null. The estimate is nonbinding;
submission rechecks current rates, configuration and available funds.

Read saved video customer billing with `await client.video.jobs.billing(job.id)`.
The call performs one authenticated GET without polling or settlement. Exact
customer amounts are decimal strings in billionths of the declared currency;
`charge_nanos` remains null until posted. Owner-funded jobs have no Niu customer
price or charge. Inspect `state` to distinguish reserved funds, missing usage,
pending settlement and reconciliation requirements.
`effective_output` retains the original dimensions, duration/FPS and estimator
identity. `estimate` retains estimated quantity/provenance and prices it using the
job's original customer tariff; `estimate.amount_nanos` remains distinct from the
reservation and final charge. Legacy output/estimate fields are null. Owner-funded
or unpriceable estimated amounts remain null; missing prices never use Supplier
purchase costs. Saved reads neither regenerate video nor reprice it at current rates.



Read current qualified commercial model bindings with
`admin.listCustomerMediaRateModels(organizationId, { after, limit }, { signal })`.
Use model and credential names for display; internal binding references are
configuration fields. Choices exclude personal keys and contain no purchase
prices or upstream credentials. Availability is rechecked before paid dispatch.

Read immutable selling history with
`admin.listCustomerMediaRates(organizationId, { after, limit }, { signal })`.
History returns exact string amounts, route revisions and effective timestamps;
page limits are 1–100. This configuration read is installation-only and contains
no Supplier purchase terms.

For a customer media price replacement, use
`admin.replaceCustomerMediaRate(organizationId, oldRevision, newCard, { signal })`.
The new card starts at the planned cutoff. Publication and retirement commit
atomically; invalid cutoffs and competing effective schedules roll back the whole
operation. Dimensions and meter must match. Historical job prices remain pinned.
Identical replay is accepted while route bindings remain current; there is no
automatic mutation retry. The separate
`admin.retireCustomerMediaRate(organizationId, revision, cutoffUnixSeconds)`
remains available to end eligibility without a replacement.


Installation administrators publish independent agreed Supplier media purchase
terms with `admin.publishSupplierMediaRate(supplierId, card)`. Keep these terms
out of customer selling configuration and customer responses. Commercial video
requires eligible purchase and selling cards; publication does not establish live
commercial qualification. The method performs one authenticated mutation without
automatic retry. Supplier earnings accrue from pinned purchase terms and reported
media usage independently of customer payment.


Use `admin.listSupplierMediaRates(supplierId, { after, limit })` for paginated
purchase history. Read amounts and effective times are exact strings; missing
historical publication dates remain null. Installation readers and the Supplier's
active members can read these terms. Installation readers use
`admin.listSupplierMediaRateModels(supplierId, { after, limit })` for named current
configuration choices; bindings are exact strings and do not qualify dispatch.
Installation writers use `admin.replaceSupplierMediaRate(supplierId, oldRevision, card)`
to publish new terms and end the old schedule at their start in one transaction, or
`admin.retireSupplierMediaRate(supplierId, oldRevision, cutoffUnixSeconds)` to end a
schedule without a replacement. Dimensions and meter remain fixed during replacement;
conflicting cutoff or stale binding rolls back the whole transition. These mutations
do not automatically retry. Old job snapshots and earnings remain unchanged.


Installation readers use `admin.listSupplierMediaOfferModels(supplierId, { after, limit })`
for named draft video-model bindings before qualification. Installation writers call
`admin.publishSupplierMediaOffer(supplierId, input)` with their own immutable UUID
receipt, current model/credential/schema revisions and `expected_revision` (null
for a new offer). Convert exact revision strings only when they fit safe positive
JavaScript integers. Publication pauses the offer and clears its review; it sends
no text prices or customer rates. Keep returned internal binding references out of
product labels. The method sends one allowlisted mutation with no automatic retry.
On uncertainty, explicitly replay the identical document and receipt. A saved
receipt never replaces a newer offer. `SupplierOffer` distinguishes media offers
with null text prices from existing text offers; purchase cards remain separate.

### Saved video results

`client.video.jobs.results.retrieve(job.id, 'video', { signal })` returns an
authenticated `Response` with the bounded media body, preserving streaming for
the caller. Use `'last_frame'` for an optional PNG/JPEG frame. No signed Supplier
URL is exposed. Read or stream the body, or abort/cancel it when no longer needed.

`await client.video.jobs.results.delete(job.id)` permanently removes Niu's saved
result references, including preventing a later refresh from restoring them.
Status and financial records remain. It does not delete Supplier copies or
previous downloads. References expire locally 24 hours after first capture;
upstream links may expire earlier. Requests do not retry automatically. See the
[video API reference](../../docs/reference/video-jobs.md#saved-results-and-deletion)
for supported formats, limits, errors and remaining live qualification.


`await client.video.jobs.results.status(job.id, { signal })` reads local result
availability without downloading media. Each kind is `available`, `missing` or
`unavailable`; an available reference does not guarantee a live Supplier link.

Signed-in dashboard clients use `admin.getDashboardVideoResultsStatus(scope, keyId,
jobId, options)`, `admin.getDashboardVideoResult(scope, keyId, jobId, kind, options)`
and `admin.deleteDashboardVideoResults(scope, keyId, jobId, options)`. Retrieval
returns a raw authenticated Response; deletion requires write permission. These
methods use the selected workspace key's grants without obtaining its secret and
never automatically retry.


`client.video.jobs.timings(reference)` can include `lifecycle` alongside transport
spans. Its `gateway_observation` timestamps describe submission intent and first
observed statuses, with explicit `conflicting_terminal`. They survive restart and
duplicate polling, but do not establish exact Supplier queue/run durations.


Video Billing's optional `settled_usage` describes the measured/billable quantity
behind a posted customer charge. Exact quantities stay rational string pairs;
Reported settlement evidence remains separate from current `usage`, estimates
and later reconciliation conflicts. It does not expose Supplier procurement
rates or internal receipt revisions.


Administrative request activity can include `request_kind: 'video' | 'inference'`.
The video kind comes from a durable pinned recovery route, including uncertain
submissions, rather than a guessed model name. Older servers may omit this field.

### Asset-management credential setup

Installation administrators can use `getAssetManagementConfiguration` and
`configureAssetManagement` for a direct Beijing Ark credential configuration.
Setup requires the explicit upstream project, Access Key pair and expected
management revision (zero initially). The response contains metadata only;
`dispatch_available` remains false. Secrets are write-only and cannot be read
back. Both helpers support cancellation and make one transport attempt.

This API saves encrypted configuration; it does not create assets, verify
entitlement, accept upstream agreements or enable generation. The complete asset lifecycle remains unqualified. Do not
include keys in source, logs or shared setup examples.

`revokeAssetManagement` revokes local management-credential reads through the
expected current revision. To erase ciphertext from the active database, set
both `erase_history` and `confirm_erase` to true. The SDK validates these fields
and makes one cancellable DELETE attempt. Audit metadata survives; upstream
Access Keys, backups and in-flight credentials are unaffected. A stale revision
conflicts without an automatic retry.

Platform administrators can record separately reviewed media-ingestion qualification
with `createAssetOperationAuthorization` and `operation: 'CreateAsset'`. Existing
group creation, read, update and deletion grants do not authorize ingestion. The
record binds current workspace/configuration/credential revisions and reviewed
evidence, expires and can be revoked through the shared authorization lifecycle.
It returns `dispatch_available: false`; it neither uploads media nor establishes
processing consent, inspection approval, an immutable source or Active readiness.

Platform administrators can record a separately reviewed ordinary-group deletion
qualification with `createAssetOperationAuthorization` and
`operation: 'DeleteAssetGroup'`. Exact workspace, configuration/credential revisions
and current evidence references are required. The record remains
`dispatch_available: false`; it neither performs deletion nor grants destructive
consent for a specific group. Read, create and update grants never imply deletion.
`dispatchOrdinaryAssetGroupDeletion(configurationId, scope, consentId, options)`
explicitly dispatches one irreversible cascading deletion using saved consent.
The server rechecks the exact grant and original credential binding and commits
one durable claim before sending. It never automatically retries; client
cancellation does not cancel an already claimed bounded worker. Read saved status
following a disconnect. Acknowledged and uncertain outcomes both require
independent reconciliation, which remains unimplemented; neither permits replay
or releases the mutation fence. No customer charge is recorded.

`prepareOrdinaryAssetGroupDeletionConsent(configurationId, input, options)` records
platform-only consent for one saved ordinary-group `intent_id` and exact deletion
`authorization_id`. Supply a new `consent_id`, workspace scope,
`confirm_cascade: true` and `valid_for_seconds` from 1 to 900. Deletion would be
irreversible and cascade to every asset in that group. This method only saves
consent and returns `dispatch_available: false`; identical replay does not extend
expiry. `getOrdinaryAssetGroupDeletionConsent(configurationId, scope, consentId,
options)` reads safe status and timing without upstream identities or secrets.
`revokeOrdinaryAssetGroupDeletionConsent(configurationId, scope, consentId, options)`
revokes consent idempotently without deleting assets or cancelling claimed work.
These methods preserve cancellation and do not retry writes. Consent alone does
not establish current dispatch eligibility.


Workspace members with write permission can call
`deleteAssetGroupRequest(scope, intentId, options)` to erase saved asset-creation
request content. The cancellable, bodyless DELETE returns no content and makes
one attempt. It preserves reconciliation metadata and does not delete upstream
assets, credentials or backups. Repeated calls do not restore request content.

`getAssetGroupRequest(scope, intentId, options)` reads only the saved status,
creation time, retention status and retained name/description. It returns null
for absent intents and hides expired or deleted content. It does not expose
Supplier account bindings, credentials, fingerprints or procurement information.

`NiuAdminClient.prepareOrdinaryAssetGroupUpdate` prepares an encrypted metadata
patch for a saved ordinary group using `organization_id`, `project_id`,
`intent_id` and `update_id`. Include `name`, `description` or both; omission
leaves a field unchanged, while `description: ""` requests clearing. The server
derives the original upstream group binding. Preparation needs a current
UpdateAssetGroup grant and returns `prepared: true`, `dispatch_available: false`.
It does not send a mutation or charge inference. Reusing an identity with a
different patch conflicts. `RequestOptions.signal` is forwarded; the SDK does
not automatically retry. Use `dispatchOrdinaryAssetGroupUpdate(configurationId, updateId, scope, options)`
for a separate explicit one-shot dispatch. Both `acknowledged` and `uncertain`
require read-back reconciliation. Cancellation does not cancel claimed work.
Never automatically retry uncertainty or a claimed identity. Use `reconcileOrdinaryAssetGroupUpdate(configurationId, updateId, readId, scope, options)`
to reconcile an acknowledged update. A retained, successful authorized read with
the same identity is reused after interruption; otherwise a fresh read is claimed. Matching metadata
releases its hold; mismatch and uncertainty preserve it. Live channel and
packaged process-recovery qualification remain incomplete.

`listOrdinaryAssetGroupUpdates` retrieves scoped, cursor-paginated audit metadata
without patch content or upstream identities. `deleteOrdinaryAssetGroupUpdatePatch`
erases retained metadata while preserving audit, holds and replay protection.
Erasure does not prove an uncertain mutation was not applied or release its hold.

### Deployment branding configuration

Platform administrators can call `admin.getBranding()` and
`admin.saveBranding(current.data.revision, settings)`. Saves require the current
revision; a conflict requires reading the latest configuration before editing
again. Empty `light` and `dark` palettes inherit NIU.IO defaults. These methods
configure display name, default appearance, bounded color tokens and optional
`logo_data_url` / `favicon_data_url` static PNGs. Images are validated and
re-encoded before persistence; null resets an asset. The Admin Branding & theme
editor applies these settings to the dashboard and sign-in screen. Explicit member
appearance choices override the deployment default. Anonymous
clients can read the display-only projection at `GET /v1/branding`.


Image ingestion consent methods are available as
`client.imageIngestions.prepare(id, input)`, `.retrieve(id)` and `.revoke(id)`.
Use `client.imageIngestions.list()` to recover saved history after losing local
state. Follow `.list({ before: page.next_cursor })` while the cursor is non-null;
pages contain at most fifty newest records and stay scoped to the original key.
They require the original source API key. Preparation records consent for one
retained inspected source, ordinary group and reviewed authorization; it does
not upload an asset. `client.imageIngestions.dispatch(id)` separately attempts
one upload when the deployment has a qualified public HTTPS source origin and
current reviewed CreateAsset permission. It persists accepted or uncertain
status; acceptance is not readiness. Never automatically retry an uncertain
upload. Dispatch is disabled by default. Revocation prevents
further source publication but does not cancel an already accepted upstream
write. Use `client.imageSources.prepare({ image, valid_for_seconds })` to inspect and
temporarily retain one inline PNG/JPEG/WebP data URL under the workspace's
required consented detectors. `client.imageSources.erase(sourceId)` removes
retained source bytes; it does not delete an upstream asset. These operations
publish no source capability on their own. Readiness and the complete asset
lifecycle remain unsupported by these methods.


For an accepted image ingestion, call
`client.imageIngestions.readiness.refresh(consentId, readId)` to make one
separately authorized GetAsset observation. A fresh read reference identifies the
attempt; do not automatically replay it after timeout or disconnect. Use
`.readiness.retrieve(consentId, readId)` to inspect its durable outcome without
another upstream call. `status: 'succeeded'` means the observation succeeded;
`asset_status: 'Processing'` still means processing. Active observations do not
grant reusable-reference rights (`reuse_available` remains false). Each ingestion
allows one outstanding observation and at most sixty per rolling hour.
## Retrying text-video creation

Persist a unique submission key before sending a text-video request:

```ts
const job = await client.video.jobs.create(request, {
  idempotencyKey: savedSubmissionKey,
  signal,
});
```

Reuse that key and the same JSON document after a lost response. It is scoped to
the workspace and returns the original job; different input conflicts. Retries
never dispatch another generation. Interrupted preparation may remain unresolved.
Do not replace the key to recover uncertain execution. This option currently
supports text-only video requests; calls without it are not idempotent.

Dashboard callers can use the same saved identity through the administration SDK:

```ts
const job = await admin.createDashboardVideoJob(scope, workspaceKeyId, request, {
  idempotencyKey: savedSubmissionKey,
  signal,
});
```

The identity is shared with public video creation in the same workspace. Keep
both the saved request and identity when resuming through either API. Current
workspace authorization and the selected key's model grants still apply.

### Balance refunds and funding reversals

Installation administration can call
`reverseCustomerBalanceEntry(organizationId, entryId, { amount_nanos, idempotency_key })`.
Use an exact positive signed-64-bit nanounit string and a stable UUID idempotency
key. The entry must be an original charge or funding entry from that company.
A charge reversal refunds account balance; a funding reversal removes previously
posted funding and may create debt. Neither operation executes an external
payment or bank refund. Original entries remain immutable.

The SDK returns `{ data: { recorded: true } }` for a recorded reversal or identical
replay. It never retries the write automatically. After an uncertain response,
explicitly replay the same amount, entry and idempotency key. Conflicting reuse
and cumulative reversals exceeding the original amount return HTTP 409. Read
`getCustomerBalanceTransactions` to inspect the resulting ledger entries; keep
routing identifiers out of customer-facing labels.

### Approved customer credit

Installation administration can call
`setCustomerBalancePolicy(organizationId, currency, { credit_limit_nanos, warning_threshold_nanos, expected_revision })`.
Amounts and revisions are exact nonnegative integer strings; a null warning
threshold disables the warning. Read `getCustomerBalance` for the current
`policy_revision`, and use revision `"0"` only to initialize an absent account.
The result contains the new revision. A stale revision returns HTTP 409; the
SDK never automatically retries or substitutes a freshly read revision.

This changes approved borrowing capacity, not received funds or payment status.
Reducing credit cannot invalidate held reservations. Without holds, a reduction
may leave existing debt above the new capacity and block further admissions.
Company administrators can use `setCustomerBalanceWarning` for the warning
preference alone; they do not gain credit-policy write authority.

Read immutable credit and warning revisions with
`getCustomerBalancePolicyHistory(organizationId, currency, { limit: 50 })`.
Pass `next_before` as `before` for older pages; stop when it is null. Each page
includes exact-string `current_revision`, and each row identifies whether it is
current in that page's snapshot. Organization-wide owners/admins and installation
administration may read; workspace-only sessions and company viewers may not.
An absent currency account returns 404, an absent revision cursor returns 409.
Revision zero and empty history mean the account has no policy writes. Reads do
not change funds or grant credit-policy write permission.

Balance transaction reads also accept optional `currency` and `kind`:
`getCustomerBalanceTransactions(organizationId, { currency: 'USD', kind: 'refund' })`.
Filtering happens before the 100-entry page limit. Keep both filters unchanged
when passing `next_cursor` as `before`; a cursor outside the selected company,
currency or kind returns HTTP 409. Omitted filters preserve the complete company
ledger view. These reads expose customer ledger amounts only, never procurement
costs, and do not execute refunds or payments.
