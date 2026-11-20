# Agent Capability & Verification Contract

Niu supplies trustworthy model inventory, customer pricing, request diagnostics, and delegated management APIs. You own the user's task execution, model selection, and quality/cost tradeoffs. Never promise optimal value, guaranteed savings, or capabilities beyond what `/v1/key` and `/v1/models` currently report.

## 1. Mandatory post-connection verification

Installing MCP or completing `/connect` does not prove live authority or workspace readiness. Immediately run these read-only checks against `{ORIGIN}` (using `Authorization: Bearer <token>` or MCP equivalents):

1. **`GET /v1/key` (MCP: `inspect_key`)** — Inspect granted scope and limits before taking any action:
   - `invocation_allowed` (`boolean`): `false` by default on `/connect` grants until explicitly enabled by the human reviewer.
   - `invocation_protocols` (`string[]`): Exact permitted interfaces among `["chat", "responses", "messages", "content", "embeddings", "video", "decisions"]`.
   - `allowed_models` (`string[]`): Exact fixed model aliases (or `["*"]` if explicitly created as wildcard on manual keys).
   - `management_capabilities` (`string[]`): Granted subset of `pools:read`, `pools:write`, `evaluations:read`, `evaluations:write`, `events:read`, `events:write`.
   - `expires_at_ms` (`number | null`), `revoked` (`boolean`), `expired` (`boolean`).
   - `spending_limits` (including `remaining_nanos`, currency/interval windows), `unit_spending_limit`, `rate_limits` (`requests_per_minute`, `tokens_per_minute`, `max_concurrent_requests`, `active_requests`), `usage_window` (60s counters including `known_usage_requests` and `unknown_usage_requests`), and `allowed_cidrs`.
2. **`GET /v1/models` (MCP: `list_models`, optional `?search=` / `?priced_only=true`)** — Authoritative workspace-accessible models and published `customer_pricing` (`prompt_rate`, `cached_prompt_rate`, `completion_rate`, `currency`, `unit`). Missing pricing remains `null` (unknown, not zero).
3. **`GET /catalog/v1/models` (MCP: `list_catalog_models`)** — Public catalog metadata (`capabilities`: `chat_completions`, `streaming`, `embeddings`, `messages`, `messages_streaming`, `generate_content`, `responses`). Catalog presence never grants workspace access or pricing.

## 2. Authoritative task references (deployment-relative)

| Task / Need | Machine Contract | Auth Scope / Boundary |
| --- | --- | --- |
| Connect host, device auth, or install MCP | [Install contract](/docs/install.md) | Browser `/connect` review (`client_name` 1–80 chars, optional `?workspace=<slug>`) |
| Call models or wire Niu into an app | [Inference contract](/docs/inference.md) | `invocation_allowed: true`, matching `invocation_protocols` and `allowed_models` |
| Configure, preview, or inspect `pool/<slug>` routing | [Workspace routing](/docs/routing.md) (`/docs/pools.md`) | `pools:read` / `pools:write`; invokes concrete models permitted on calling key |
| Fingerprint inputs, record evaluations, compare runs | [Evaluation workflow](/docs/evaluations.md) | `evaluations:read` / `evaluations:write`; trial calls require `invocation_allowed: true` |
| Poll resource events or manage signed webhooks | [Resource events](/docs/events.md) | `events:read` / `events:write`; HTTPS port 443 webhooks, one-time `signing_secret` |
| Inspect request billing, latency, and tokens | `GET /v1/generations/{id}` (`get_generation`) | Customer charges & token breakdown only; see [Inference contract](/docs/inference.md) |
| Generate video jobs and fetch results | [Video reference](/docs/reference/video/) | `invocation_protocols` includes `video`; inspect `/v1/video/models` first |
| Browse complete REST schemas | [OpenAPI spec](/docs/openapi/public.json) | Published request and response schemas. Each operation requires its documented permissions. |
| Browse MCP tools and TypeScript SDK | [MCP guide](/docs/guides/mcp/) · [SDK reference](/docs/api/sdk/) | Exact client schemas and tool parameters |
| End-to-end sample walkthrough | [Build with Niu](/docs/guides/personal-assistant/) | Human walkthrough + runnable personal-assistant starter |

## 3. HTTP <-> MCP quick parity

| Capability | HTTP Endpoint | MCP Tool |
| --- | --- | --- |
| Inspect active key & remaining budget | `GET /v1/key` | `inspect_key` |
| List authorized workspace models & prices | `GET /v1/models` | `list_models` |
| Inspect public catalog metadata | `GET /catalog/v1/models` | `list_catalog_models` |
| Reconcile one request's tokens & charge | `GET /v1/generations/{id}` | `get_generation` |
| Manage workspace routing policies | `/v1/routing*` | `list_pools`, `get_pool`, `preview_pool`, `set_pool`, `get_pool_history`, `get_pool_selections` |
| Manage task evaluations & run receipts | `/v1/evaluations*` | `fingerprint_evaluation_request`, `list_evaluations`, `get_evaluation`, `set_evaluation`, `list_evaluation_attempts`, `list_evaluation_runs`, `record_evaluation_run`, `get_evaluation_run`, `compare_evaluation_runs` |
| Poll events, incidents & webhooks | `/v1/events*`, `/v1/incidents/{reference}` | `list_workspace_events`, `get_workspace_incident`, `list_event_subscriptions`, `get_event_subscription`, `set_event_subscription`, `get_event_subscription_history`, `get_event_deliveries`, `test_event_subscription` |
| Execute model inference | `/v1/chat/completions`, `/v1/responses`, `/v1/messages`, `/v1beta/models/...`, `/v1/embeddings`, `/v1/video/jobs` | `create_chat_completion`, `compare_models`, `create_response`, `create_message`, `generate_content`, `create_embeddings`, video/media tools |

## 4. Operational recovery & human handoff

- **Missing authority (`403`)**: Check `GET /v1/key` to pinpoint whether `invocation_allowed` is `false`, a protocol is missing from `invocation_protocols`, the model is outside `allowed_models`, or a management scope is absent. Ask the user to approve a new `/connect` request (or adjust manual key permissions in `/workspaces/{slug}/keys`), then re-inspect `/v1/key` yourself.
- **No manual JSON relay**: Retrieve models, policy diffs, evaluation comparisons, and generation diagnostics directly from the API or MCP; ask the human only for goals, budget authority, and `/connect` or dashboard approvals.
- **No cross-channel confusion**: Keep Niu resource events (`/v1/events*`), host IDE hooks, and server-side Niu platform plugins strictly distinct. Never reroute the user's own coding-agent inference as a side effect of connecting Niu management.
