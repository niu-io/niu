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
```

The gateway is still an early implementation. Streaming response ergonomics and a stable typed completion schema will be added as the public API contract matures.

Use `chat.completions()` for a JSON response and `chat.stream()` for SSE:

```ts
const controller = new AbortController();
for await (const chunk of client.chat.stream({
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
```

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
