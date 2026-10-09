# Private Codex subscription supply

Status: private account sign-in, encrypted credential storage, account-specific model discovery, serialized token rotation, pool selection, and buffered text inference are implemented. Live provider qualification requires the owner to sign in and complete an actual request. This feature does not claim that an ordinary Codex CLI credential authorizes the integration.

## Connect an account

Run the self-hosted dashboard on the gateway computer using `http://127.0.0.1` and its application port. On **Suppliers**, find **Private Codex subscriptions**, choose the Niu workspace, and select **Connect Codex**. Give the account a recognizable name, then choose **Continue with ChatGPT**. Authorize ChatGPT plan usage in the provider's sign-in flow. The dashboard returns to the selected workspace after sign-in.

Connect additional accounts to that workspace to form its private pool. Each renewable registration has exactly one Niu workspace owner. Reconnect an existing account using its **Sign in** action; registering the same renewable session again is rejected. **Pause** stops new selection. **Resume** does not clear an outstanding execution lease.

The supported integration is OpenAI's [ChatGPT plan usage for open-source and locally hosted apps](https://developers.openai.com/siwc/token-sharing-open-source). Paid or remotely hosted integrations have a separate provider process. This private connection does not publish subscription capacity in the public model catalog or create a commercial Supplier offer.

## Call Niu

Use a Niu API key issued for the selected workspace. `GET /v1/models` lists that workspace's eligible subscription models as `codex/<provider-model-slug>`. Other workspaces cannot discover or dispatch these models, even if their keys allow all model aliases. Explicit model grants can also use the private alias.

```sh
curl "$NIU_BASE_URL/v1/responses" \
  -H "Authorization: Bearer $NIU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"codex/<available-model-slug>","input":"Say hello.","stream":false}'
```

Replace the placeholder with an alias returned by your workspace's model listing. Text-only `POST /v1/chat/completions` also accepts `model`, `messages`, and optional `stream: false`. Messages may have `system`, `developer`, `user`, or `assistant` roles and string content. System messages become developer input items upstream.

The Responses entry point accepts `model`, nonempty string `input`, optional string `instructions`, optional `stream: false`, and optional `store: false`. Niu sends an input array with `stream: true` and `store: false` to the documented public Responses endpoint. It buffers the stream and returns a response only after `response.completed`. Failed, incomplete, malformed, and interrupted streams do not become successful responses. Unknown usage stays unknown; customer responses exclude upstream financial data.

This first adapter supports buffered text responses. Downstream streaming, tools, structured output, image/file inputs, sampling controls, token limits, and persistent provider conversation references are not supported. Unsupported fields produce an explicit capability error. The dashboard Chat currently requests streaming and sampling controls, so this adapter is called through the documented API rather than that Chat flow. Account-specific model choices appear in the private supply panel and `/v1/models`, not the installation-wide model listing.

## Ownership, credentials, and execution

The gateway owns a stable host identifier and encrypted credential records in PostgreSQL. Configure `NIU_VENDOR_ENCRYPTION_KEY`; saved connections require the same encryption key after restart. OAuth credentials never enter browser storage, list responses, accounting records, or trace output. The encrypted record contains access, rotating refresh, and retained ID tokens, granted scopes, and expiry information. Encryption is authenticated and bound to the account identity.

Initial registration uses `dynamic_agent_client`, a random state and OIDC nonce, and PKCE S256. The gateway retains the issued client ID and validates the ID token's RSA signature against the provider's published JWKS, issuer, audience, expiry, and nonce. It requires plan usage and renewable-session scopes before saving the account. Reauthorization must preserve the registered identity and client ID. Callback state is single-use and expires after ten minutes. Restarting during sign-in requires a new attempt. Callback responses disable caching and referrer forwarding; HTTP traces omit query strings.

Selection is restricted to ready accounts listing the requested model, with no held lease and no active cooldown. The scheduler selects the least recently used eligible account and atomically claims an exclusive durable lease. Each account serves one execution at a time. Token renewal shares that lease, so two requests cannot race refresh-token rotation. The generic account refresh and preparation methods cannot operate on a Codex connection; this adapter owns its coordinator. Dispatch records link the selected account and credential revision to the durable gateway attempt.

Confirmed completion or rejection releases the lease. Authentication rejection requires sign-in. Rate-limit responses apply `Retry-After` seconds when supplied, otherwise a short retry backoff. This backoff is not a claim about a subscription quota reset. Niu does not poll or invent provider quota balances, convert percentage windows to tokens, infer available capacity after resets, or derive a per-request purchase price from the subscription fee.

There is no automatic retry, cross-account replay, or paid API fallback after a request is dispatched. Network ambiguity, missing terminal events, malformed terminal evidence, and uncertain token rotation retain the lease across gateway restarts. Pause/resume cannot release it. An operator recovery workflow for these uncertain leases remains unimplemented; do not use database edits as an automatic timeout recovery. Local disconnect/revocation and configurable pool priority are also future work. The owner can revoke the app in ChatGPT settings and pause its Niu connection.

The API contract is [codex-connections.openapi.yaml](../../contracts/codex-connections.openapi.yaml). The provider's [registration](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), and [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) define upstream eligibility and capabilities.
