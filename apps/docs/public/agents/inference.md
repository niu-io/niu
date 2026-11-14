# Model Inference & Application Integration Contract

Use this contract when wiring Niu into an application backend or executing authorized model calls during coding-agent verification and evaluations.

## Prerequisites (verify first)

Before sending any inference request, confirm via `GET /v1/key`:

1. `invocation_allowed` is `true`
2. Your target interface appears in `invocation_protocols`
3. Your target model alias (or downstream selected model behind `pool/<slug>`) is permitted in `allowed_models`

Do not send paid requests on a user's behalf without explicit authorization and an agreed test budget.

---

## Authentication & Base URLs

- **Headers**: `Authorization: Bearer <NIU_API_KEY>` or `x-niu-api-key: <NIU_API_KEY>`
- **Content-Type**: `application/json`
- **Primary base URL**: `{ORIGIN}/v1` (hosted Niu: `https://niu.io/v1`)
- **Native Gemini-compatible path**: `{ORIGIN}/v1beta/models/{encoded_model}:generateContent`

### Standard application SDK environment variables

```sh
# OpenAI SDK (JavaScript / Python / Go)
OPENAI_BASE_URL="{ORIGIN}/v1"
OPENAI_API_KEY="<NIU_API_KEY>"

# Anthropic SDK (appends /v1/messages automatically; omit /v1 here)
ANTHROPIC_BASE_URL="{ORIGIN}"
ANTHROPIC_API_KEY="<NIU_API_KEY>"

# Direct Niu SDK / @niu-io/mcp
NIU_BASE_URL="{ORIGIN}/v1"
NIU_API_KEY="<NIU_API_KEY>"
```

Never embed workspace API keys in frontend JavaScript bundles or public repositories.

---

## Supported Inference Interfaces

| `invocation_protocols` entry | HTTP Endpoint | MCP Tool | Required Body Fields & Notes |
| --- | --- | --- | --- |
| `chat` | `POST /v1/chat/completions` | `create_chat_completion`, `compare_models` | `model`, `messages`; supports `tools`, `tool_choice`, `response_format`, `reasoning`, `temperature`, `max_completion_tokens`, `stream` |
| `responses` | `POST /v1/responses` | `create_response` | `model`, `input`; optional `instructions`, `max_output_tokens`, `temperature`, `top_p`, `metadata` |
| `messages` | `POST /v1/messages` | `create_message` | `model`, `max_tokens`, `messages`; optional `system`, `tools`, `tool_choice`, `stop_sequences`, `stream` |
| `content` | `POST /v1beta/models/{encoded_model}:generateContent` | `generate_content` | `contents`, `generationConfig.maxOutputTokens`; URL-encode `/` in model aliases (e.g. `pool%2Fassistant:generateContent`) |
| `embeddings` | `POST /v1/embeddings` | `create_embeddings` | `model`, `input`; optional `encoding_format`, `dimensions`, `user` |
| `decisions` | `POST /v1/decisions` | — | Bounded structured decision (`model`, `input`, `output_schema`); concrete Chat model alias only (`pool/` rejected) |
| `video` | `POST /v1/video/jobs` (+ `POST /v1/video/estimate`, `GET /v1/video/models`) | `create_video_job`, `estimate_video`, `list_video_models` | Async durable job lifecycle; see [Video reference](/docs/reference/video/) |

---

## Workspace Routing Aliases & Request Headers

- **`pool/<slug>` model alias**: Pass `"model": "pool/<slug>"` to select models dynamically according to your [Workspace routing policy](/docs/routing.md). The calling key must authorize the concrete downstream model chosen by the policy.
- **`x-niu-routing-context`**: Optional JSON header (`{"task": "code-review", "stage": "verify"}`) used by `v2` Auto routing context paths before invoking any bounded decider.
- **`X-Niu-Task-ID`**: Optional correlation tag (`1..200` printable ASCII characters) grouping requests in workspace activity and analytics.
- **`x-niu-evaluation`**: Optional binding (`"<evaluation-slug>@<revision>/<sample>"`) linking this attempt to a [Task evaluation](/docs/evaluations.md).
- **`x-niu-log-payloads`**: Set `"false"` to opt out of 24-hour request/response payload capture (`"true"` or `"false"`).

Example Chat Completion request:

```http
POST /v1/chat/completions HTTP/1.1
Host: {ORIGIN_HOST}
Authorization: Bearer niu_...
Content-Type: application/json
X-Niu-Task-ID: assistant-draft-01
x-niu-routing-context: {"task":"summarize","stage":"prod"}
x-niu-log-payloads: false

{
  "model": "pool/default-chat",
  "messages": [
    { "role": "user", "content": "Summarize these three action items." }
  ],
  "max_completion_tokens": 512
}
```

---

## Diagnostics & Billing Reconciliation

Text and MCP responses expose `attempt_id` (generation UUID). Inspect execution telemetry and settled customer billing via:

- **`GET /v1/generations/{id}`** (MCP: `get_generation`)

Key response fields under `data`:

- `id`, `model`, `provider_model`, `request_kind`
- `created_at`, `dispatched_at`, `completed_at`, `duration_ms`, `timing`
- `execution` (outcome status), `finish_reasons`, `failure`, `output_guardrail_outcome`
- `usage_confidence`, `usage` (prompt, cached read/write, completion, reasoning tokens)
- `customer_charge` (customer-facing settled charge only; `null`/unknown does not mean free; Provider procurement costs and margins are never returned)

---

## Error Handling & Safe Retry Rules

- **`401 Unauthorized`**: Invalid, expired, or revoked key (`inspect_key` or prompt re-connection at `/connect`).
- **`403 Forbidden`**: Missing `invocation_allowed`, protocol omitted from `invocation_protocols`, or model outside `allowed_models`. Never attempt workarounds or model substitution; inspect `/v1/key` and inform the user which permission is missing.
- **`402` / `429`**: Spending limit or rate limit (`requests_per_minute`, `tokens_per_minute`, `max_concurrent_requests`) reached. Respect `Retry-After` if present; do not tighten limits silently.
- **`5xx` / timeout**: Because upstream Provider charges may already exist, **do not blindly replay paid inference**. Reconcile first via `GET /v1/generations/{id}` (when you have `attempt_id`), `GET /v1/evaluations/{slug}/attempts` (for tagged evaluation attempts), or `GET /v1/video/jobs` (for video jobs).
