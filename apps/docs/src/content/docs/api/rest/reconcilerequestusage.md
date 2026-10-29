---
title: "Supplement missing native request usage from captured OpenRouter evidence"
description: "POST /api/v1/organizations/{organization}/projects/{project}/requests/{attempt}/usage-reconciliation"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/projects/{project}/requests/{attempt}/usage-reconciliation`

Installation write access only. Empty object input; no client-supplied generation identifier, quantities or costs. Uses the stored server response reference and original managed credential only while its vendor revision remains current and enabled. New captured references pin the dispatched upstream model independently of later mapping edits; legacy references without that binding still require the unchanged enabled model revision. Exact upstream model match required; aliases are not inferred equivalent. Bounded metadata lookup can return 502 while metadata is unavailable. Eligible requests have unknown aggregate usage, or confirmed provider-reported totals with missing cache-read/reasoning quantities and no recorded monetary or Credits customer charge. For known totals, metadata must match both totals and every reported known category, and add at least one previously missing category. Cache-write quantities are not supplied by this lookup; existing quantities are preserved. Canonical metadata must confirm not-cancelled execution with stop/length/tool_calls and an exact model/reference match. Cancelled or nonterminal metadata remains unresolved. Atomically retains the original execution/usage/category state and immutable supplemental terminal evidence, then marks execution confirmed-completed. Existing completion timestamps are preserved; absent timestamps record the time confirmation is stored. Original failure and delivery timing remain unchanged. Recorded does not mean settled: existing financial recovery applies the request-bound tariffs; missing required categories keep liability unresolved. Never resubmits inference. Identical replay returns the saved receipt without upstream access. Cache-Control no-store. New v2 receipts retain terminal finish/cancellation evidence. Legacy v1 receipts retain null terminal fields without invented backfill.

Operation: `reconcileRequestUsage`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/requests/{attempt}/usage-reconciliation" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### organization

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### project

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### attempt

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

## Responses

### HTTP 200

Supplemental usage recorded; settlement may remain pending.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "status",
    "source_version",
    "recorded_at",
    "prompt_tokens",
    "completion_tokens",
    "cached_input_tokens",
    "reasoning_output_tokens",
    "cache_write_input_tokens",
    "original_execution",
    "upstream_finish_reason",
    "upstream_cancelled"
  ],
  "properties": {
    "status": {
      "type": "string",
      "enum": [
        "recorded"
      ]
    },
    "source_version": {
      "type": "string",
      "enum": [
        "openrouter-native-generation-v1",
        "openrouter-native-generation-v2"
      ]
    },
    "recorded_at": {
      "type": "string",
      "format": "date-time"
    },
    "prompt_tokens": {
      "type": "string",
      "pattern": "^[0-9]+$"
    },
    "completion_tokens": {
      "type": "string",
      "pattern": "^[0-9]+$"
    },
    "cached_input_tokens": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$"
    },
    "reasoning_output_tokens": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$"
    },
    "cache_write_input_tokens": {
      "type": "null"
    },
    "original_execution": {
      "type": "string",
      "enum": [
        "confirmed_completed",
        "may_have_executed"
      ]
    },
    "upstream_finish_reason": {
      "type": [
        "string",
        "null"
      ],
      "enum": [
        "stop",
        "length",
        "tool_calls",
        null
      ],
      "description": "Null for legacy v1 receipts; never backfilled."
    },
    "upstream_cancelled": {
      "type": [
        "boolean",
        "null"
      ],
      "enum": [
        false,
        null
      ],
      "description": "Explicit false for v2 terminal evidence; null for legacy v1 receipts."
    }
  }
}
```

### HTTP 400

Malformed JSON input.

### HTTP 401

Authentication required.

### HTTP 403

Installation write access required.

### HTTP 404

Scope unavailable.

### HTTP 409

Ineligible completion, changed route or conflicting evidence. usage_reconciliation_identity_mismatch means upstream model/reference identity differs from captured request evidence; identities are not exposed. usage_reconciliation_incomplete means matching provider metadata does not confirm a non-cancelled terminal generation. Usage and charges remain unresolved in both cases.

### HTTP 422

Input must be an empty JSON object; unknown fields are rejected.

### HTTP 502

Upstream metadata unavailable, refused, malformed, oversized or timed out.

### HTTP 503

Storage or credential decryption unavailable, including a bounded record-lock or statement timeout. A failed recording transaction preserves prior usage and leaves no partial receipt; retry does not resubmit inference.

## Behavior and supported scope

Installation write access only. Empty object input; no client-supplied generation identifier, quantities or costs. Uses the stored server response reference and original managed credential only while its vendor revision remains current and enabled. New captured references pin the dispatched upstream model independently of later mapping edits; legacy references without that binding still require the unchanged enabled model revision. Exact upstream model match required; aliases are not inferred equivalent. Bounded metadata lookup can return 502 while metadata is unavailable. Eligible requests have unknown aggregate usage, or confirmed provider-reported totals with missing cache-read/reasoning quantities and no recorded monetary or Credits customer charge. For known totals, metadata must match both totals and every reported known category, and add at least one previously missing category. Cache-write quantities are not supplied by this lookup; existing quantities are preserved. Canonical metadata must confirm not-cancelled execution with stop/length/tool_calls and an exact model/reference match. Cancelled or nonterminal metadata remains unresolved. Atomically retains the original execution/usage/category state and immutable supplemental terminal evidence, then marks execution confirmed-completed. Existing completion timestamps are preserved; absent timestamps record the time confirmation is stored. Original failure and delivery timing remain unchanged. Recorded does not mean settled: existing financial recovery applies the request-bound tariffs; missing required categories keep liability unresolved. Never resubmits inference. Identical replay returns the saved receipt without upstream access. Cache-Control no-store. New v2 receipts retain terminal finish/cancellation evidence. Legacy v1 receipts retain null terminal fields without invented backfill.

**Supported scope:** implemented
