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

Embedding calls use the configured OpenAI-compatible route and are available only when that route explicitly enables embeddings. Optional dimensions and base64 output must also be enabled on the route. The SDK does not add retries.

`chat.completions()` types OpenAI-compatible function tools, tool choices, JSON response formats, tool-call results, and usage. The selected route must enable the matching server-side capability. Niu returns tool requests to the client; the application remains responsible for reviewing and executing them. Structured JSON is checked for valid JSON syntax, not against the supplied schema.

`responses.create()` supports the documented non-streaming text subset of the OpenAI Responses API when the selected route enables `supports_responses`. It accepts a string `input`; multimodal inputs, tool calls, conversation state and streaming are not included in this subset. The SDK passes `AbortSignal` through to the request.

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

`NiuAdminClient` is separate from the inference client and requires an installation administrator token. Keep that token in the collector's server environment. These methods do not poll providers, refresh credentials or execute inference.

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
    console.log(request.model, request.prompt_tokens, request.cash_nanos ?? 'cost unknown');
  }
  if (!activity.next_cursor) break;
  activity = await admin.listGatewayActivity(scope, { limit: 100, after: activity.next_cursor });
}
```

Gateway activity is automatically retained metadata for requests admitted by Niu. Pages are scoped to the organization and project, newest first, and the cursor reads older entries; traversal is a live view rather than a cross-page snapshot. Token counts and costs are nullable decimal strings, so unknown usage or cost must stay unknown. Request and response bodies are not included.

Use `createAccount(scope, input)` to register account metadata and an `env:` or `secret:` credential reference. Registration is not credential verification. Use `observeQuota(scope, accountId, observation)` with evidence obtained by an authorized collector. `remaining` and `maximum` are decimal strings or null, never floating-point values. Timestamps are safe-integer milliseconds. The server validates intervals, quantity bounds and tenant ownership. Identical observations may be explicitly resubmitted; conflicting evidence returns `NiuAPIError` with status 409. The SDK does not retry automatically and rejects redirects. Every method accepts an optional `{ signal }` for cancellation.

The API reports capacity separately from monetary charges. Missing or stale quota evidence does not mean zero remaining capacity. Native provider collection remains unfinished. Project-scoped collector credentials are available for quota ingestion.

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
## Experimental SDK task adapter (unqualified)

This experimental API example routes an application-owned task through Niu; it
does not integrate a named coding agent. Neither agent rerouting nor telemetry
collection is a supported integration until a named agent, version and mode
pass end-to-end qualification. Niu Agent Connect remains planned after
platform readiness.

```ts
import { NiuAgentAdapter } from '@niu-io/sdk';

const adapter = new NiuAgentAdapter({
  apiKey: process.env.NIU_API_KEY!,
  collectorToken: process.env.NIU_EXECUTION_COLLECTOR_TOKEN!,
  scope: {
    organizationId: process.env.NIU_ORGANIZATION_ID!,
    projectId: process.env.NIU_PROJECT_ID!,
  },
  apiBaseURL: 'https://gateway.example/v1',
  adminBaseURL: 'https://gateway.example/admin/v1',
});

const task = adapter.createTask();
try {
  await task.withAgent(async agentId => {
    const response = await task.chatCompletions({
      model: 'fast',
      messages: [{ role: 'user', content: 'Summarize the report.' }],
    }, { parentSpanId: agentId });
    await task.withTool(async () => runLocalTool(response), agentId);
    await task.validate(() => checkResult(), agentId);
  });
  await task.finish();
} catch (error) {
  await task.finish('failed');
  throw error;
}
```

For this experimental example, create a project-scoped collector key with
`purpose: "execution"` using the administrator API, then keep it beside the
project inference key in a trusted server-side environment. Never expose an
installation administrator token to an agent. The task's stable ID is sent as
`X-Niu-Task-ID`; Niu captures model requests automatically, while the adapter
adds local retry, tool and validator/human outcome metadata. Coverage defaults
to `partial`, since the adapter cannot see unwrapped work. It stores no prompts,
responses, tool arguments, tool output or error text. A returned attempt UUID
links metadata to gateway usage and any settled cost; missing usage or pricing
remains unknown.
`finish()` submits the metadata record once; after a failed submission,
`report()` resubmits the same idempotent record. Inference retries are never
implicit, and an agent claim by itself is not acceptance evidence.
