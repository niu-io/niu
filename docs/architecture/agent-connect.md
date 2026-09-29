# Niu Agent Connect integration design

Status: implementation prototype, 2026-09-29. Codex CLI routing is implemented
in the Niu gateway, console, and source-checkout connector, but it is not
release-qualified or verified against a live ChatGPT account. The Codex source
review below is pinned to upstream commit
`c248f6d48b97eb4a2aa56147a0b11b7d763278b9`. There is no universal connector
that can route every coding agent to every model while preserving every
subscription. Qualification is specific to an agent surface and version,
request protocol, provider, authentication mode, and feature set.

## Decision

Build Agent Connect as three separate pieces:

1. **Request routing:** configure a coding agent's client-supported provider
   endpoint and model ID so inference calls reach Niu. Establish support from
   the exact client version's source or observed behavior. The gateway records
   these calls automatically. The connector only changes client configuration;
   it does not intercept arbitrary traffic.
2. **Task instrumentation:** use that agent's supported hooks, plug-in API,
   app server, or telemetry to record task, turn, tool, retry, and outcome
   events. A model request or task ID alone is not a complete agent trace.
3. **Evaluation:** run controlled, isolated tasks and attach validator or human
   acceptance evidence before calculating task economics. Routine Playground
   model comparisons remain useful without being presented as agent benchmarks.

These pieces can be released independently. A connector must declare exactly
which pieces and capabilities it supports. The current Codex slice implements
routing only. Task instrumentation and task-economics analysis remain separate
work after the base provider → scoped key → gateway request → automatic
Activity path is independently accepted.

## Routing and billing modes

| Mode | Request path and payer | What Niu can claim |
| --- | --- | --- |
| **Niu API key** | Agent sends the project-scoped Niu key; Niu uses its configured provider credential. Provider API usage is billed to that configured account. | Gateway request, attempt, usage, and any supported cost evidence. This mode does not use the agent user's subscription. |
| **Subscription-preserving proxy** | Agent sends its provider-authenticated request through Niu and sends the Niu project key separately, for example in `X-Niu-API-Key`. Niu forwards only the provider authorization and protocol headers explicitly allowed for that qualified route. | Gateway request metadata plus provider subscription usage evidence only to the extent independently available. Qualification needs source-level or runtime evidence for the exact client route, provider eligibility review, and an end-to-end payer check. A published proxy API is not a prerequisite for researching client behavior. |
| **Activity collection** | Model requests stay on the agent's existing route. A documented hook, telemetry export, app server, or explicit local collector sends metadata to Niu. | External agent-reported activity with source and coverage labels. It is not gateway traffic and may not include every model request or task event. |

Never silently switch between modes. A connector must not scrape or copy an
agent's OAuth/session token from its local files. Prefer the agent's own auth
manager, which can refresh credentials as they change. If Niu Connect owns an
app-server auth session, use the app-server's refresh exchange instead of
polling local token files. In subscription-preserving mode the gateway receives
provider auth in memory to forward it; it must not persist or log that
credential, must restrict forwarding to the configured provider origin, reject
unsafe redirects, and remove Niu's key before upstream dispatch. A subscription
login cannot be reused to call an unrelated provider or model.

Niu accepts `X-Niu-API-Key` separately from `Authorization` and removes the Niu
key before dispatch. Ordinary provider routes use credentials configured in
Niu. A distinct `codex-chatgpt` route forwards Codex's current authorization
only to the fixed `https://chatgpt.com/backend-api/codex` destination and only
for `/models` and streaming `/responses`. It forwards a small allowlist of
Codex identity, session, and Responses routing headers in both directions,
rejects redirects, and never stores or logs the provider token. Codex remains
responsible for its local sign-in and refresh.
This route is a technical prototype; provider eligibility and actual payer
remain unverified.

## Protocol boundary

An agent's endpoint setting only works if Niu implements the protocol and
features that agent sends. Provider support on Niu's upstream side does not
mean a coding agent can send that provider's native request format to Niu.

Current public model-facing ingress is:

- `/v1/chat/completions`: a documented OpenAI-compatible subset, with streaming
  available on supported OpenAI-compatible routes. Tool and structured-output
  behavior is capability-gated; Niu does not execute the agent's tools.
- `/v1/responses`: ordinary OpenAI-compatible routes support the current
  non-streaming, text-only subset. The dedicated Codex route accepts the Codex
  Responses JSON and streams the fixed upstream response through unchanged;
  it records terminal model and token usage when present. This does not claim
  support for every Codex account type or establish subscription billing.
- `/v1/codex/models`: a Codex-native model catalog proxy filtered to model
  aliases allowed by the Niu key.
- `/v1/embeddings`: a non-streaming OpenAI-compatible subset.
- No native Anthropic `/v1/messages` or Google Gemini `generateContent`
  ingress is registered.

This makes an OpenAI-compatible API-key route the first practical connector
target. It does not make every model interchangeable. For broader support, add
native ingress adapters only when a client requires them, preserve provider
semantics where possible, and publish per-model capability flags. Do not
silently flatten reasoning, tool, image, streaming, cache, or structured-output
features into a weaker common format.

## Codex source findings

Codex source establishes a concrete request-construction path for a custom
Responses provider:

- `ModelProviderInfo` accepts a custom `base_url`, `wire_api = "responses"`,
  `requires_openai_auth`, environment-backed extra headers, and a
  `supports_websockets` capability. With ChatGPT login active and no provider
  API key override, Codex resolves its current auth and adds `Authorization`
  plus `ChatGPT-Account-ID` to provider requests. Some feature configurations
  may use Codex-managed agent identity auth instead, so Niu must forward the
  authorization value opaquely. The environment-backed header map can carry a
  separate Niu project key.
- ChatGPT auth refresh is owned by Codex: its auth manager refreshes near token
  expiry and handles 401 recovery. When an app-server host owns external auth,
  Codex requests refreshed tokens through its `chatgptAuthTokens/refresh`
  protocol. Niu Connect does not need to extract or synchronize Codex's token.
- Codex's ChatGPT-auth default destination is
  `https://chatgpt.com/backend-api/codex`; this is the backend path that would
  need qualification for subscription billing. Sending the same bearer token
  to `api.openai.com/v1` is a different route and must not be assumed to retain
  subscription billing.
- Codex sends HTTP inference as streaming `POST /responses` requests with an
  array of typed input items and fields for tools, tool choice, reasoning,
  streaming, and other controls. The provider can disable Responses WebSockets,
  leaving HTTP streaming as the transport to qualify. In the reviewed source,
  remote compaction also streams through `/responses` and expects a special
  compaction output item; it does not call `/responses/compact`.
- Codex's dynamic workspace/backend routing is conditional on its first-party
  provider identity and Codex backend URL. A Niu-named custom endpoint bypasses
  that path. Naming the provider `OpenAI` is not a workaround: when Codex's
  first-party routing activates, it rewrites the request origin to the
  discovered backend, taking inference outside Niu. Do not assume the account
  ID header alone handles accounts that require workspace discovery or backend
  routing; qualify those account types separately or design an explicit
  routing handoff.
- Codex model discovery expects its `ModelsResponse` catalog shape, including
  Codex model metadata. Niu's ordinary `/v1/models` response is the OpenAI
  `data` list, so the connector points Codex to `/v1/codex/models`. Niu proxies
  that native catalog through the fixed ChatGPT Codex destination, filters it
  to aliases allowed by the project key, and rewrites each returned slug to
  the Niu alias.
- Codex core records a `TokenUsageRecord` for each completed Responses result
  when that result includes usage. The record carries response, thread, turn,
  session, and root-turn IDs plus per-response and cumulative token counts.
  Rollout persistence keeps these records but filters out the raw
  `RawResponseItem` and `RawResponseCompleted` events. A local collector can
  therefore ingest per-response token observations without copying transcript
  content, but it must treat missing usage as missing evidence and cannot
  derive a settled subscription cost from token counts alone. Resolve the
  configured model from turn metadata; the usage record itself does not name
  the model, and a configured model must not be reported as a server-confirmed
  model when that evidence is unavailable.
- Codex stores rollouts as JSONL under its configured Codex home, by default
  `~/.codex/sessions/`. These files also persist conversation items that can
  contain prompts, outputs, reasoning, image references, and tool arguments.
  A Niu local collector should request explicit file-access consent, read only
  the minimum event types needed, and never upload rollout lines wholesale.
  Cold rollouts may be compressed to `.jsonl.zst`, so offline catch-up needs a
  compressed-file reader or an explicit, visible gap policy. Rollout lines use
  a timestamp/ordinal envelope and tagged item payload; parse only the
  `token_usage_record` variant needed for this first slice.
- The app server emits ordinary turn/item notifications and aggregate token
  updates. Its per-response raw item and usage notifications are gated by
  `thread/start.experimentalRawEvents`, which the source labels internal-only
  (for example, Codex Cloud). Raw items may include message text, reasoning,
  tool calls, arguments, and outputs. Treat this as an unstable internal
  surface, not a released third-party connector contract, unless Codex
  qualifies it for that use. For a first collect-only connector, the local
  rollout's per-response usage record is the narrower source; task/tool
  lifecycle coverage still needs its own versioned mapping and verification.

These findings establish client-side technical feasibility for sending
ChatGPT-authenticated requests to a configured destination. The implemented
route covers the HTTP Responses and native model-catalog paths described
above. It does not prove that the ChatGPT backend accepts a third-party proxy,
that every workspace account routes correctly, that the plan permits this
usage, or that ChatGPT remains the payer. Those claims require an authorized
end-to-end check against the exact Codex build and account type. No live
subscription token or paid request is needed to inspect the source path.

Source pointers at the reviewed commit: [provider configuration, auth selection,
and backend-route detection](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/model-provider-info/src/lib.rs),
[ChatGPT bearer and account headers](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/model-provider/src/bearer_auth_provider.rs),
[managed auth resolution, including agent identity](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/model-provider/src/auth.rs),
[first-party provider auth and workspace routing](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/model-provider/src/provider.rs),
[Responses HTTP streaming](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/codex-api/src/endpoint/responses.rs),
[remote compaction over Responses](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/core/src/compact_remote_v2.rs),
[managed token refresh](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/login/src/auth/manager.rs),
[app-server external-auth refresh](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/app-server/src/external_auth.rs),
[Codex model catalog request](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/model-provider/src/models_endpoint.rs),
the [local JSON catalog setting](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/core/src/config/mod.rs),
and [Codex model catalog schema](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/protocol/src/openai_models.rs).
For collection, see [per-response usage persistence](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/core/src/session/mod.rs),
[usage record identity and counters](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/protocol/src/protocol.rs),
[turn model metadata](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/protocol/src/protocol.rs),
[rollout JSONL envelope and item encoding](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/history/src/rollout_payload.rs),
[rollout persistence policy](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/rollout/src/policy.rs),
[rollout directory layout](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/rollout/src/list.rs),
[rollout compression and readers](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/rollout/src/compression.rs),
[raw-event opt-in declaration](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/app-server-protocol/src/protocol/v2/thread.rs),
[app-server raw-event gate](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/app-server/src/request_processors/thread_lifecycle.rs),
and [app-server event mapping](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/app-server/src/bespoke_event_handling.rs).

## Current client capability map

The entries below are documented integration candidates, not verified Niu
integrations. Vendor documentation and implementation details change; pin exact
client versions and repeat the compatibility review before release.

| Client | Routing/configuration evidence | Subscription status | Task evidence surface | Niu gap and next proof |
| --- | --- | --- | --- | --- |
| **OpenCode** | Custom provider `baseURL`, model IDs, and extra headers support API-key routing through compatible APIs. | No subscription-preserving claim. A custom endpoint is not proof that an OpenCode or upstream subscription remains the payer. | The current V2 plug-in API exposes session and tool execution hooks. | Best first candidate for API-billed routing plus a separate task plug-in. Verify the pinned version, actual model request, event coverage, and supported Niu request fields. [Provider configuration](https://opencode.ai/v2/docs/providers/) · [Plug-ins](https://opencode.ai/v2/docs/build/plugins/) |
| **Aider** | `OPENAI_API_BASE` and `OPENAI_API_KEY` route OpenAI-compatible requests. | No subscription-preserving route established. | The endpoint setup alone does not provide task, tool, or acceptance evidence. | Candidate for a small API-key connector after the selected model's Chat Completions capabilities are qualified. A task adapter or controlled runner is still required. [OpenAI-compatible APIs](https://aider.chat/docs/llms/openai-compat.html) |
| **Codex CLI** | Source inspection confirms a custom Responses provider with Codex-managed ChatGPT auth. Niu has a source-checkout launcher that pins one model alias and sends the Niu key separately. | Routing is implemented as a prototype, not qualified. Custom Niu routing bypasses Codex's first-party workspace/backend routing; plan eligibility and actual payer remain unverified. | Niu records routed request/attempt metadata and terminal provider token usage when present. It does not capture Codex tool calls as a complete task trace, retries, validation, or accepted outcomes. | Verify the exact Codex build, account type, model, catalog, auth refresh, streaming, cancellation, errors, retries, coverage, and payer. The fixed route supports HTTP Responses and model discovery; WebSockets are disabled. Task instrumentation remains separate. [Provider/auth source](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/model-provider-info/src/lib.rs) · [Responses transport source](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/codex-api/src/endpoint/responses.rs) · [Usage record source](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/protocol/src/protocol.rs) · [App-server usage schema](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/app-server-protocol/schema/json/v2/ThreadTokenUsageUpdatedNotification.json) |
| **Claude Code** | `ANTHROPIC_BASE_URL` routes requests to a gateway. A gateway credential normally replaces the saved claude.ai login; setting only the base URL retains that login. `ANTHROPIC_CUSTOM_HEADERS` can carry a separate Niu key. | Anthropic documents the base-URL-only subscription path to Claude and requires forwarding the OAuth capability header. Anthropic does not support routing Claude Code to non-Claude models through a gateway. Eligibility still needs review. | OpenTelemetry includes per-request model, duration, token counts, and estimated cost; hooks expose tool lifecycle events. These are different sources with different coverage. | Niu needs native Anthropic Messages ingress and an explicit, allowlisted caller-auth pass-through path before this can be a candidate. Prove same-Claude billing and streaming end to end; do not offer cross-provider model switching from Claude Code. [Gateway behavior](https://code.claude.com/docs/en/llm-gateway) · [Gateway setup and custom headers](https://code.claude.com/docs/en/llm-gateway-connect) · [Monitoring](https://code.claude.com/docs/en/monitoring-usage) · [Hooks](https://code.claude.com/docs/en/hooks) |
| **Gemini CLI** | `GOOGLE_GEMINI_BASE_URL` overrides the endpoint when using Gemini API-key authentication. The documented setting does not apply to generic Code Assist sign-in. | Do not describe Code Assist or Google-account subscription routing through Niu as supported. | Gemini CLI provides configurable OpenTelemetry, but that alone does not establish task acceptance or complete tool coverage. | Niu needs the corresponding Gemini API ingress and feature coverage. First qualify API-key routing; keep Code Assist auth on Google's documented route unless support is documented. [Configuration](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md) · [Telemetry](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/telemetry.md) |

OpenCode is the recommended first API-key connector because its documented
custom provider configuration and plug-in lifecycle provide separate paths
for routing and task instrumentation. This is a recommendation for a
research-backed first slice, not a claim that it has been tested with Niu.
Codex, Claude Code, Gemini CLI, Aider, Continue, and other clients should be
added by capability and exact version rather than a promise of universal
coverage. ACP can standardize an agent-to-editor session, but it does not route
the agent's model API calls; it is an optional task-control surface, not a
gateway adapter. [ACP overview](https://github.com/agentclientprotocol/agent-client-protocol)

## Task event contract

Gateway request records are the source of truth for Niu-routed model requests,
attempts, provider-reported usage, and Niu-accounted charges. They do not show
what the coding agent did between requests. An adapter or controlled runner
must emit, where available:

- run, task, session, turn, agent/subagent, request, and attempt identifiers;
- start/end timestamps, status, cancellation, and parent/causal relationships;
- tool start/end, tool category, retry, validation, and escalation events;
- validator identity/version and result, or explicit human acceptance;
- instrumentation coverage, missing events, duplicates, delayed delivery, and
  corrections.

`X-Niu-Task-ID` is an optional correlation label on an inference request. It
does not prove that the whole task was captured or completed. Join model calls
to task events only through stable IDs such as task, request, or attempt IDs;
do not infer links from time or model name. If the agent cannot provide a
stable link, preserve the records separately and show the missing coverage.

Collect metadata only by default. Prompt and response text, source files, tool
arguments/results, and credentials need separate explicit opt-in, retention,
and deletion controls. Event delivery must be bounded and asynchronous so a Niu
collector outage cannot block the agent run. Agent-reported token/cost values
are attributed to that source; they never overwrite gateway ledger evidence.

## Benchmark contract

Benchmarking an agent is a controlled task run, not a single chat request and
not an imported transcript. For each run, retain the task-definition version,
starting snapshot hash, agent and version, model alias and actual provider
model when known, agent configuration, tools and versions, permissions,
environment, time/budget limits, and validator version. Isolate working copies
and record any human intervention.

Compare models with the same agent and task setup. Compare agents with a fixed
model/provider when possible and report unavoidable configuration differences.
Randomize run order and use paired repetitions when the task is nondeterministic.
Count a run as accepted only when deterministic validation or a named human
review supplies evidence; agent-reported completion alone remains unverified.

Show the metric vector rather than collapsing performance to one number:

- acceptance and quality evidence;
- task wall-clock time and model-request latency;
- agent turns, model requests/retries, tool calls, and human interventions;
- input/output/cache tokens when their source reports them;
- settled API cash, explicit subscription-fee allocation, and other measured
  execution costs.

Unknown cost remains unknown. Keep subscription fees, quota usage, API-equivalent
estimates, provider-reported estimates, and settled cash separate. Do not claim
that routing through a subscription saves a multiple of API cost. Calculate
cost per accepted task only when acceptance evidence exists; show incomplete
cost coverage rather than treating a known subtotal as the full cost. Without
acceptance evidence, show observations, not a matched-task economic benchmark.

## Recommended sequence and release proof

1. Pass R20's real provider → scoped key → Niu request → automatically visible
   Activity path. Do not use a local fixture result as release evidence.
2. Verify the implemented Codex route against an authorized exact-version
   session after R20 platform acceptance. Check model discovery, current-token
   refresh, streaming, cancellation, errors, retries, activity, account
   eligibility, and actual payer. Keep usage without a price unpriced. Do not
   claim complete task, tool, retry, or acceptance capture.
3. Qualify one API-billed OpenCode route against a real, authorized provider
   and the exact model capabilities selected. Record the agent version, config
   diff, request/attempt IDs, activity entry, and unsupported features.
4. Add the OpenCode task adapter separately. Prove tool/retry/outcome coverage
   with a controlled task and independent acceptance evidence; publish its
   blind spots.
5. Add native protocol ingress where demand requires it. Evaluate a Claude Code
   same-Claude subscription pass-through as its own security and billing
   project. For Codex, qualify the implemented fixed-origin route for the exact
   account type and payer rather than waiting for a published proxy guide.
   Qualify Gemini API-key routing separately from Code Assist.
6. Build the isolated task runner and paired benchmark only after R17's event
   links and acceptance evidence are independently verified. Keep provider
   eligibility, unknown costs, and unsupported client features visible.

For every released combination, publish the exact client/version, Niu release,
protocol, configured provider/model alias, auth and payer, tested feature set,
observed data, omitted data, and verification date. A successful endpoint
configuration or chat smoke does not qualify an agent, subscription path, or
task benchmark.
