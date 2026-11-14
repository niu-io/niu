---
title: "Workspace Routing"
---


Use workspace routing policies (configured under **Routing** in workspace navigation and invoked as model alias `pool/<slug>`) to select among workspace-visible concrete model aliases using deterministic priority/weight bands, customer-price estimates, or bounded Auto strategy routing. Workspace routing policies are strictly workspace-owned; platform supply pools and Provider procurement rates are never exposed.

---

## Operations & Interface Parity

Every read operation requires `pools:read`; mutating operations require `pools:write`.

| Capability | HTTP Endpoint (`{ORIGIN}/v1/...`) | MCP Tool (`@niu-io/mcp`) | JS SDK (`NiuClient`) | Required Scope |
| --- | --- | --- | --- | --- |
| List policies | `GET /v1/routing` (optional `?after=<slug>`) | `list_pools` | `listPools(after?)` | `pools:read` |
| Get policy & revision | `GET /v1/routing/{slug}` | `get_pool` | `getPool(slug)` | `pools:read` |
| Dry-run policy | `POST /v1/routing/preview` (`{ configuration, context? }`) | `preview_pool` | `previewPool(config, context?)` | `pools:read` |
| Create or replace policy | `PUT /v1/routing/{slug}` (top-level `configuration` JSON) | `set_pool` (`{ configuration }`) | `setPool(configuration)` | `pools:write` |
| Soft-delete current revision | `DELETE /v1/routing/{slug}?revision={rev}` | — | `deletePool(slug, revision)` | `pools:write` |
| Inspect immutable history | `GET /v1/routing/{slug}/history` (`?before=<rev>`) | `get_pool_history` | `getPoolHistory(slug, before?)` | `pools:read` |
| Inspect recent selections | `GET /v1/routing/{slug}/selections` | `get_pool_selections` | `getPoolSelections(slug)` | `pools:read` |

Check generated request and response models in `/docs/api/rest/setworkspacepool/` or `/docs/openapi/public.json`.

---

## Authority & Invocation Boundaries

1. Check `/v1/key` (`inspect_key`) first:
   - `pools:read` permits inspection, history reads, and non-dispatching previews.
   - `pools:write` permits creating, updating, or soft-deleting workspace routing policies. An ordinary inference key or wildcard `allowed_models` grant never confers routing management permission.
2. Call `/v1/models` (`list_models`) first: every candidate alias in a policy must be visible in the current workspace and allowed by the managing key.
3. Invoking `"model": "pool/<slug>"` checks the **calling key's** `invocation_allowed: true`, `invocation_protocols`, and `allowed_models` against the concrete candidate selected at request time. Creating a routing policy cannot expand `allowed_models`, establish customer prices, or bypass spending limits.
4. For version 2 `auto` with an optional `decider`, the decider model must be a workspace-visible Chat model allowed for the invoking key with a comparable customer selling price in the declared currency and unit.

---

## Configuration Schema (`configuration`)

When calling `PUT /v1/routing/{slug}` via HTTP, send the `configuration` object directly as the JSON request body. When calling MCP (`set_pool`, `preview_pool`), wrap it as `{ "configuration": { ... } }`.

```json
{
  "slug": "assistant",
  "name": "Assistant Routing Policy",
  "description": "Balanced text routing for coding assistance.",
  "enabled": true,
  "revision": 0,
  "candidates": [
    { "alias": "claude-sonnet-4-6", "priority": 100, "weight": 100, "enabled": true },
    { "alias": "gpt-5.4-mini", "priority": 50, "weight": 100, "enabled": true }
  ],
  "rules": [
    {
      "id": "tools-preferred",
      "name": "Prefer tool-capable primary",
      "enabled": true,
      "conditions": {
        "protocol": "chat",
        "tools": true,
        "streaming": true
      },
      "candidates": [
        { "alias": "claude-sonnet-4-6", "priority": 100, "weight": 100, "enabled": true }
      ]
    }
  ],
  "default_action": "candidates",
  "strategy": {
    "version": 1,
    "mode": "priority_weight"
  }
}
```

### Top-level fields & constraints

| Field | Required | Type / Constraints |
| --- | --- | --- |
| `slug` | Yes | `string`, pattern `^[a-z0-9]+(?:-[a-z0-9]+)*$`, max 80 chars; reserved words rejected (`index`, `history`, `preview`, `audit`, `new`) |
| `name` | Yes | `string`, length `1..200` |
| `description` | Yes | `string`, length `0..4000` (pass `""` if empty) |
| `enabled` | Yes | `boolean`; `false` blocks runtime selection through `pool/<slug>` |
| `revision` | Yes | Integer optimistic lock: `0` creates a new policy; updates must pass the current saved integer revision |
| `candidates` | Yes | Array of `1..64` candidate objects: `{ "alias": string (1..200), "priority": int (-1000..1000), "weight": int (1..10000), "enabled": boolean }` |
| `rules` | No | Up to `32` rule objects: `{ "id": string, "name": string, "enabled"?: boolean, "conditions"?: Conditions, "candidates": Candidate[] }`; rule candidate aliases must exist in top-level `candidates` |
| `default_action` | No | `"candidates"` (default) or `"reject"` when no rule matches |
| `strategy` | No | Versioned selection policy (omitted defaults to v1 `priority_weight`) |

#### `conditions` fields (all optional)

- `protocol`: `"chat" | "messages" | "responses"`
- Boolean capability filters: `streaming`, `vision`, `tools`, `structured_output`, `reasoning`
- Integer token bounds (`>= 0`): `min_input_tokens`, `max_input_tokens`, `min_output_tokens`, `max_output_tokens`

---

## Selection Strategies (`strategy`)

### Version 1: `priority_weight` and `customer_price`

- `priority_weight`: `{ "version": 1, "mode": "priority_weight" }`. Selects from the highest eligible `priority` band weighted by `weight`.
- `customer_price`: estimates an ordinary call from whole-request context tier, request fee, and minimum charge without assuming cache or reasoning discounts:

```json
{
  "version": 1,
  "mode": "customer_price",
  "customer_price": {
    "currency": "USD",
    "unit": "nanounits_per_million_tokens",
    "input_tokens": 2000,
    "output_tokens": 500
  }
}
```

Missing or incomparable customer prices stay explicitly unknown and fall back to `priority_weight` instead of treating unknown prices as zero. Ties break by higher priority, higher weight, then alias order.

### Version 2: `auto` (context-first + optional bounded single-round decider)

Version 2 `auto` defines `2..8` response-compatible `paths` referencing top-level candidate aliases:

```json
{
  "version": 2,
  "mode": "auto",
  "auto": {
    "paths": [
      {
        "id": "fast-text",
        "name": "Fast general text",
        "response_type": "text",
        "candidates": ["gpt-5.4-mini"],
        "task": ["summarize", "triage"],
        "stage": ["draft"]
      },
      {
        "id": "deep-code",
        "name": "Complex reasoning",
        "response_type": "text",
        "candidates": ["claude-sonnet-4-6"],
        "task": ["code-review"],
        "stage": ["final"]
      }
    ],
    "decider": {
      "model": "gpt-5.4-mini",
      "currency": "USD",
      "timeout_ms": 1500,
      "max_calls": 1,
      "max_input_tokens": 1024,
      "max_output_tokens": 128,
      "max_spend_nanos": 500000,
      "min_confidence": 0.7,
      "on_abstain": "fallback",
      "on_failure": "fallback"
    }
  }
}
```

- `response_type` per path: `"text" | "structured" | "embedding"`.
- `task` and `stage` accept up to `16` lowercase tokens (`^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$`, max 64 chars) matching HTTP header `x-niu-routing-context` (or SDK `routingContext`).
- Runtime evaluates caller `task`/`stage` context first and invokes `decider` (always `max_calls: 1`, `timeout_ms` `50..5000`, `max_input_tokens` `1..4096`, `max_output_tokens` `1..1024`, `max_spend_nanos` `1..100000000`, `min_confidence` `0..1`) only when no context path matches.
- `decider` can select only a declared, request-compatible path; abstention, failure, timeout, or invalid output follows `on_abstain` / `on_failure` (`"fallback"` to deterministic priority/weight, or `"reject"`).

---

## Dry-Run Preview (`POST /v1/routing/preview`)

Always run `preview_pool` before saving changes. Preview applies rule matching, declared-capability filters, `customer_price` ranking, and `auto` path evaluation without saving or calling any model (Auto decider calls are reported as `0`).

Optional `context` fields:
- `protocol` (required when `context` is provided): `"chat" | "responses" | "messages" | "embeddings" | "generate_content"`
- Boolean traits: `streaming`, `vision`, `tools`, `structured_output`, `reasoning`, `embedding_dimensions`, `embedding_base64`
- Token hints: `estimated_input_tokens` (`0..10000000`), `requested_output_tokens` (`1..10000000`)
- Auto routing hints: `task`, `stage`

Preview weights show a selection distribution, not the next concrete draw; a weight denominator of `0` means no candidate is eligible. Preview does not validate complete request payloads or guarantee live Provider health.

---

## Optimistic Concurrency, Rollback & Execution Evidence

1. Retain the baseline configuration from `get_pool` before editing.
2. Submit `set_pool` (`PUT /v1/routing/{slug}`) with the current `revision`, then read back `get_pool` to verify the new saved state and incremented revision. On a `409 Conflict`, re-read `get_pool`, reconcile your diff, preview again, and retry — never blindly replay stale mutations.
3. Inspect recent runtime routing decisions via `get_pool_selections` (returns up to the latest 100 selections, including `pool_revision`, selected model alias, linked operation/attempt references, and Auto decision outcome/reason/calls/latency/estimated decision charge).
4. `response_status: 200` on a selection proves only HTTP response start, never stream completion or task quality. Follow `attempt_id` with `GET /v1/generations/{id}` (`get_generation`) for terminal status, usage, and customer charge. Missing status or incomplete references remain unknown.
5. Roll back by reading `get_pool_history` (paginated via `next_before`) and writing the chosen prior configuration back via `set_pool` with the **current** expected `revision` (or use `DELETE /v1/routing/{slug}?revision=<rev>` to soft-delete while keeping the slug and history immutable).

Related contracts: [Install](/docs/install.md) · [Capabilities](/docs/agents.md) · [Model inference](/docs/inference.md) · [Evaluations](/docs/evaluations.md) · [Events](/docs/events.md) · [OpenAPI](/docs/openapi/public.json)
