# @niu-io/mcp

`niu-mcp` is a local stdio Model Context Protocol (MCP) server for coding agents (Claude Code, Cursor, Windsurf, Zed, Codex, and custom MCP clients). It calls an existing Niu gateway with a workspace API key (`NIU_API_KEY`) over `/v1`, `/v1beta`, and `/catalog/v1`. It never opens the database directly, never substitutes or guesses a model, and never exposes Provider purchase costs or platform margins.

## Quick start

For a release archive, follow the [installation contract](https://github.com/niu-io/niu/blob/release/0.3/apps/docs/public/install.md) and verify its `SHA256SUMS` checksum and `SOURCE_COMMIT` provenance against the selected release tag before installing.

To use a source build, check out your selected commit from `release/0.3` and run these commands from the checkout root:

```sh
pnpm --filter @niu-io/mcp install --frozen-lockfile
pnpm --dir sdks/mcp build
```

Configure the agent to run `node` with the absolute path to the built checkout's `sdks/mcp/bin/niu-mcp.mjs`. Add `--hosted` for the hosted gateway and supply `NIU_API_KEY` through the agent's environment.

The hosted client pins `https://niu.io/v1` in [`hosted/niu.io.json`](hosted/niu.io.json). A customer key is never stored in that file.

For a self-hosted or local Niu gateway, set its `/v1` address and omit `--hosted`:

```sh
NIU_API_KEY='your-workspace-api-key' \
NIU_BASE_URL='http://127.0.0.1:2555/v1' \
node /absolute/path/to/niu/sdks/mcp/bin/niu-mcp.mjs
```

### Optional environment variables

| Variable | Description |
| --- | --- |
| `NIU_KEY_ID` | Canonical workspace key UUID (`X-Niu-Key-Id`) when `NIU_API_KEY` is a scoped console session token |
| `NIU_CREDENTIAL_HEADER` | `authorization` (default `Bearer`) or `x-niu-api-key` |
| `NIU_LOG_PAYLOADS` | `true` or `false` default for `x-niu-log-payloads` (set `false` to opt out of 24h request/response payload retention) |
| `NIU_TASK_ID` | Default `X-Niu-Task-ID` correlation tag (1–200 printable ASCII characters) to group agent requests in workspace activity |

`NIU_EVENT_SECRET_DIR` optionally selects the private signing-credential directory (default `~/.config/niu/events`). It must be outside the repository, owned by the current user, private to that user and have safe parent directories. The bundled adapter enforces POSIX ownership/modes; Windows requires an ACL-capable host adapter before secret-issuing tools can run.

## Exposed MCP capabilities

### 1. Key introspection, model discovery & generation telemetry
- `inspect_key` (`GET /v1/key`): Inspect the current key label, `allowed_models`, `expires_at_ms` (Unix milliseconds; null means no automatic expiration), `spending_limits` (with `remaining_nanos`), rate_limits (requests_per_minute, tokens_per_minute, max_concurrent_requests, active_requests), 60-second `usage_window` (requests, known_usage_requests, unknown_usage_requests, known_prompt_tokens, known_completion_tokens), and `allowed_cidrs`.
- `list_models` (`GET /v1/models`): List models accessible to this workspace key and their published `customer_pricing`, with optional `search` and `priced_only` filters.
- `list_catalog_models` (`GET /catalog/v1/models`): List public catalog models with customer metadata and supported protocol capabilities (`chat_completions`, `streaming`, `embeddings`, `messages`, `messages_streaming`, `generate_content`, `responses`).
- `get_generation` (`GET /v1/generations/{id}`): Retrieve exact token breakdown (`prompt_tokens`, `completion_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `reasoning_output_tokens`), latency phases (`dispatch_ms`, `headers_ms`, `first_output_ms`, `total_ms`), `output_guardrail_outcome`, and settled `customer_charge` for an `attempt_id`.

### Workspace routing policies

These six tools call `/v1/routing` and require explicitly delegated `pools:read` or `pools:write` capabilities. Discover grants with `inspect_key`; ordinary inference keys do not gain management access.

- `list_pools` (`GET /v1/routing`), `get_pool` (`GET /v1/routing/{slug}`): retrieve scoped policies and current revisions.
- `preview_pool` (`POST /v1/routing/preview`): validate `configuration` and optionally simulate request `context` (including `task` and `stage` for version 2 Auto strategies) against shared policy/metadata filters; returns exclusions and selection weights without persistence or inference. It does not validate full input, reserve capacity or establish live qualification.
- `set_pool` (`PUT /v1/routing/{slug}`): save `configuration` using revision zero to create or the current expected revision to update; read back and reconcile conflicts without automatic replay.
- `get_pool_history` (`GET /v1/routing/{slug}/history`): retrieve immutable prior configurations, following `next_before`.
- `get_pool_selections` (`GET /v1/routing/{slug}/selections`): retrieve the latest 100 selections with policy revision and execution references. HTTP status does not establish generation completion or quality; use linked diagnostics for terminal state, usage and customer charges.

Invoke a policy as `pool/<slug>` only when execution is authorized and the caller permits its concrete candidates. Pass optional `routing_context` (`{ task?, stage? }`, forwarded as `x-niu-routing-context`) on inference tools when targeting a version 2 Auto policy. The selected model keeps its ordinary inference, guardrail and billing path. Platform supply pools and procurement data remain separate. See the [workspace routing workflow](https://niu.io/docs/routing.md) and generated REST schemas for exact bounds and evidence limits.

### Workspace evaluations

These nine tools call `/v1/evaluations` and require explicitly delegated `evaluations:read` or `evaluations:write` capabilities. Discover grants with `inspect_key`; ordinary inference keys do not gain evaluation management access.

- `list_evaluations` (`GET /v1/evaluations`): list workspace task/rubric definitions (`evaluations:read`), paginating with `next_after`.
- `get_evaluation` (`GET /v1/evaluations/{slug}`): read the current or pinned revision of an evaluation definition (`evaluations:read`).
- `set_evaluation` (`PUT /v1/evaluations/{slug}`): create (`revision: 0`) or update a task/rubric definition and sample request hashes (`evaluations:write`); read back after uncertain responses without blind replay.
- `fingerprint_evaluation_request` (`POST /v1/evaluations/fingerprint`): compute the protocol-bound version 1 input hash (`evaluations:read`) without running inference or saving raw input.
- `list_evaluation_attempts` (`GET /v1/evaluations/{slug}/attempts`): discover admitted inference attempts for a pinned `revision` and `sample` (`evaluations:read`) after uncertain responses.
- `list_evaluation_runs` (`GET /v1/evaluations/{slug}/runs`): list immutable attributed run receipts (`evaluations:read`), paginating with `next_after`.
- `record_evaluation_run` (`POST /v1/evaluations/{slug}/runs`): record submitter-reported agent/check verdicts and evaluator version (`evaluations:write`) with linked operation-attempt customer charges.
- `get_evaluation_run` (`GET /v1/evaluations/{slug}/runs/{run}`): read an immutable evaluation run receipt (`evaluations:read`).
- `compare_evaluation_runs` (`GET /v1/evaluations/{slug}/compare`): compare two runs across verified matched samples (`evaluations:read`), preserving unknown charges and shared-operation warnings.

See the [evaluation workflow](https://niu.io/docs/evaluations.md) for fingerprinting, request binding (`evaluation` / `x-niu-evaluation`), and evidence limits.

### Workspace resource events & incidents

`list_workspace_events` (`GET /v1/events/log`) reads immutable workspace event evidence without needing a public receiver, and `get_workspace_incident` (`GET /v1/incidents/{reference}`) reconciles an incident event reference (`incident-<32 hex>`) within the current workspace without exposing Provider identity, procurement data, or other tenant information. `list_event_subscriptions`, `get_event_subscription`, `get_event_subscription_history`, `get_event_deliveries`, `list_workspace_events`, and `get_workspace_incident` require `events:read`. `set_event_subscription` and `test_event_subscription` require `events:write` and an authorized public HTTPS destination. Ordinary inference keys do not acquire these grants.

Creation and explicit rotation prepare private local storage before the remote mutation, save the one-time signing secret there and return only `signing_secret_file`. Never print or commit it. If a remote mutation succeeds but local persistence fails, inspect the saved revision, repair storage and explicitly rotate; do not replay blindly. Changing destination requires rotation. Disabling prevents future attempts but cannot recall a request already transmitted.

A targeted test returns queued evidence; inspect delivery acknowledgement separately. Workspace event subscriptions support `pool.changed`, `evaluation.recorded`, `incident.opened`, and `incident.resolved`. Notifications do not establish receiver processing, host wake or task success. See the [agent event workflow](https://niu.io/docs/events.md) for signing, deduplication, cursor recovery, current limits and verification evidence.

### 2. Multi-protocol inference & parallel model consultation
- `create_chat_completion` (`POST /v1/chat/completions`): OpenAI-compatible Chat Completions with sampling controls, structured `response_format` (`text`, `json_object`, `json_schema`), `reasoning` / `reasoning_effort`, function `tools` / `tool_choice`, `log_payloads`, `evaluation`, `routing_context` (`x-niu-routing-context`), and `task_id`. Returns `choices`, `usage`, and `attempt_id`.
- `compare_models`: Run the same chat messages concurrently across 1–5 explicit Niu models to compare responses, latency (`duration_ms`), token usage, and `attempt_id` side-by-side (supports `log_payloads`, `evaluation`, `routing_context`, and `task_id`).
- `create_response` (`POST /v1/responses`): OpenAI Responses API text generation with `instructions`, `max_output_tokens`, `metadata`, `routing_context`, and extracted `output_text`.
- `create_message` (`POST /v1/messages`): Native Anthropic Messages API with `system`, `max_tokens`, `stop_sequences`, `routing_context`, and client `tools`.
- `generate_content` (`POST /v1beta/models/{model}:generateContent`): Native buffered Gemini `generateContent` with optional `routing_context`.
- `create_embeddings` (`POST /v1/embeddings`): OpenAI-compatible text embeddings (`float` or `base64`, optional `dimensions`, optional `routing_context`).

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
- `media_asset_groups` (`list`, `create`, `get`, `update`, `delete`, `refresh` on `/v1/media/groups`)
- `media_assets` (`list`, `create`, `get`, `rename`, `delete`, `refresh` on `/v1/media/assets`)
- `media_asset_operations` (`list`, `get`, `get_by_idempotency`, `prepare`, `dispatch`, `cancel` on `/v1/media/operations`)
- `media_verification_sessions` (`list`, `create`, `get`, `refresh`, `link` on `/v1/media/verifications`)
- `media_image_ingestions` (`prepare_source`, `erase_source`, `list`, `prepare_consent`, `get_consent`, `revoke_consent`, `dispatch`, `get_readiness`, `refresh_readiness`)

### 5. MCP resources & prompts
- **Resources**: `niu://key`, `niu://models`, `niu://catalog/models`, `niu://video/models`, `niu://media/capabilities`, `niu://branding`, plus templates `niu://generations/{id}` and `niu://video/jobs/{id}`.
- **Prompts**: `consult_model`, `compare_models`, `check_key_budget`, and `generate_video_workflow`.

See [Coding agents](../../apps/docs/src/content/docs/guides/mcp.mdx) for setup instructions.
