# @niu-io/mcp

`niu-mcp` is a local stdio Model Context Protocol (MCP) server for coding agents (Claude Code, Cursor, Windsurf, Zed, Codex, and custom MCP clients). It calls an existing Niu gateway with a workspace API key (`NIU_API_KEY`) over `/v1`, `/v1beta`, and `/catalog/v1`. It never opens the database directly, never substitutes or guesses a model, and never exposes Provider purchase costs or platform margins.

## Quick start

Install the built package from the immutable Niu release; a source checkout is not required:

```sh
npm install --global https://github.com/niu-io/niu/releases/download/v0.2.14/niu-io-mcp-0.1.0.tgz
NIU_API_KEY='your-workspace-api-key' niu-mcp --hosted
```

In an agent's MCP configuration, use `"command": "niu-mcp"` and `"args": ["--hosted"]`. The executable works from your application's workspace. If the editor does not inherit PATH, use the absolute path returned by `command -v niu-mcp`; JSON does not expand shell variables or `~`.

The hosted client pins `https://niu.io/v1` in [`hosted/niu.io.json`](hosted/niu.io.json). A customer key is never stored in that file.

For a self-hosted or local Niu gateway, set its `/v1` address and omit `--hosted`:

```sh
NIU_API_KEY='your-workspace-api-key' \
NIU_BASE_URL='http://127.0.0.1:2555/v1' \
niu-mcp
```

For MCP development, run `pnpm install --frozen-lockfile` from the Niu checkout root, then `pnpm --dir sdks/mcp build`. Configure `node` with the absolute path to that checkout's `sdks/mcp/bin/niu-mcp.mjs` and optional `--hosted`; a relative path fails when the agent runs in a different workspace.

### Optional environment variables

| Variable | Description |
| --- | --- |
| `NIU_KEY_ID` | Canonical workspace key UUID (`X-Niu-Key-Id`) when `NIU_API_KEY` is a scoped console session token |
| `NIU_CREDENTIAL_HEADER` | `authorization` (default `Bearer`) or `x-niu-api-key` |
| `NIU_LOG_PAYLOADS` | `true` or `false` default for `x-niu-log-payloads` (set `false` to opt out of 24h request/response payload retention) |
| `NIU_TASK_ID` | Default `X-Niu-Task-ID` correlation tag (1–200 printable ASCII characters) to group agent requests in workspace activity |

## Exposed MCP capabilities

### 1. Key introspection, model discovery & generation telemetry
- `inspect_key` (`GET /v1/key`): Inspect the current key label, `allowed_models`, `expires_at_ms` (Unix milliseconds; null means no automatic expiration), `spending_limits` (with `remaining_nanos`), rate_limits (requests_per_minute, tokens_per_minute, max_concurrent_requests, active_requests), 60-second `usage_window` (requests, known_usage_requests, unknown_usage_requests, known_prompt_tokens, known_completion_tokens), and `allowed_cidrs`.
- `list_models` (`GET /v1/models`): List models accessible to this workspace key and their published `customer_pricing`, with optional `search` and `priced_only` filters.
- `list_catalog_models` (`GET /catalog/v1/models`): List public catalog models with customer metadata and supported protocol capabilities (`chat_completions`, `streaming`, `embeddings`, `messages`, `messages_streaming`, `generate_content`, `responses`).
- `get_generation` (`GET /v1/generations/{id}`): Retrieve exact token breakdown (`prompt_tokens`, `completion_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `reasoning_output_tokens`), latency phases (`dispatch_ms`, `headers_ms`, `first_output_ms`, `total_ms`), `output_guardrail_outcome`, and settled `customer_charge` for an `attempt_id`.

### 2. Multi-protocol inference & parallel model consultation
- `create_chat_completion` (`POST /v1/chat/completions`): OpenAI-compatible Chat Completions with sampling controls, structured `response_format` (`text`, `json_object`, `json_schema`), `reasoning` / `reasoning_effort`, function `tools` / `tool_choice`, `log_payloads`, and `task_id`. Returns `choices`, `usage`, and `attempt_id`.
- `compare_models`: Run the same chat messages concurrently across 1–5 explicit Niu models to compare responses, latency (`duration_ms`), token usage, and `attempt_id` side-by-side.
- `create_response` (`POST /v1/responses`): OpenAI Responses API text generation with `instructions`, `max_output_tokens`, `metadata`, and extracted `output_text`.
- `create_message` (`POST /v1/messages`): Native Anthropic Messages API with `system`, `max_tokens`, `stop_sequences`, and client `tools`.
- `generate_content` (`POST /v1beta/models/{model}:generateContent`): Native buffered Gemini `generateContent`.
- `create_embeddings` (`POST /v1/embeddings`): OpenAI-compatible text embeddings (`float` or `base64`, optional `dimensions`).

### 3. Video generation, estimation, polling, diagnostics & result downloads
- `list_video_models` (`GET /v1/video/models`): Discover configured video models, input types, control schemas, output dimensions, and billing meters (`video_tokens` / `seconds`).
- `estimate_video` (`POST /v1/video/estimate`): Pre-flight output specification, metered quantity, and customer charge estimate without submitting a job.
- `create_video_job` (`POST /v1/video/jobs`): Submit a video generation job with `idempotency_key` replay safety and optional `wait: true` to poll until completion.
- `list_video_jobs` (`GET /v1/video/jobs`): List workspace video jobs newest-first.
- `get_video_job` (`GET /v1/video/jobs/{id}`): Read persisted video job state, with optional `refresh`, `include_billing`, `include_timings`, and `include_results` bundling.
- `refresh_video_job` (`POST /v1/video/jobs/{id}/refresh`): Poll upstream once for a direct-channel video job.
- `wait_for_video_job`: Poll a video job to completion using Niu's safe waiting contract.
- `get_video_job_billing` (`GET /v1/video/jobs/{id}/billing`): Inspect video reservation, estimate, settled usage, and customer charge.
- `get_video_job_diagnostics` (`GET /v1/video/jobs/{id}/timings` & `/observations`): Inspect transport spans, lifecycle observations, and upstream query history.
- `get_video_job_results` (`GET /v1/video/jobs/{id}/results`): Check `video` and `last_frame` availability without downloading media.
- `download_video_result` (`GET/POST /v1/video/jobs/{id}/results/{kind}`): Save generated `video` (`mp4`/`webm`) or `last_frame` (`png`/`jpeg`) to a local `output_path` and/or return an inline MCP image block for `last_frame`.
- `delete_video_results` (`DELETE /v1/video/jobs/{id}/results`): Permanently delete saved local video result references.

### 4. Native media capabilities, assets, verification & image ingestions
- `list_media_capabilities` (`GET /v1/media/capabilities`)
- `media_asset_groups` (`list`, `create`, `get`, `update`, `delete`, `refresh` on `/v1/media/asset-groups`)
- `media_assets` (`list`, `create`, `get`, `rename`, `delete`, `refresh` on `/v1/media/assets`)
- `media_asset_operations` (`list`, `get`, `get_by_idempotency`, `prepare`, `dispatch`, `cancel` on `/v1/media/asset-operations`)
- `media_verification_sessions` (`list`, `create`, `get`, `refresh`, `link` on `/v1/media/verification-sessions`)
- `media_image_ingestions` (`prepare_source`, `erase_source`, `list`, `prepare_consent`, `get_consent`, `revoke_consent`, `dispatch`, `get_readiness`, `refresh_readiness`)

### 5. MCP resources & prompts
- **Resources**: `niu://key`, `niu://models`, `niu://catalog/models`, `niu://video/models`, `niu://media/capabilities`, `niu://branding`, plus templates `niu://generations/{id}` and `niu://video/jobs/{id}`.
- **Prompts**: `consult_model`, `compare_models`, `check_key_budget`, and `generate_video_workflow`.

See [Coding agents](../../apps/docs/src/content/docs/guides/mcp.mdx) for setup instructions.
