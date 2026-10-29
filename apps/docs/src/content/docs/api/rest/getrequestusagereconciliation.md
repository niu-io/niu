---
title: "Read recorded supplemental request usage"
description: "GET /api/v1/organizations/{organization}/projects/{project}/requests/{attempt}/usage-reconciliation"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/requests/{attempt}/usage-reconciliation`

Workspace read access required. Returns the same customer-safe immutable receipt as reconciliation, without querying upstream or modifying usage or accounting. Absence, unknown attempt and out-of-scope attempt return 404. Quantities are decimal strings; missing categories remain null. Recorded does not guarantee settlement. No original raw upstream metadata, generation reference, credential, Provider price or endpoint is exposed. Cache-Control no-store. New v2 receipts retain terminal finish/cancellation evidence. Legacy v1 receipts retain null terminal fields without invented backfill.

Operation: `getRequestUsageReconciliation`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/requests/{attempt}/usage-reconciliation" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
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

No request body is declared.

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

### HTTP 401

Authentication required.

### HTTP 404

No recorded receipt in the authorized workspace.

### HTTP 503

Storage or credential decryption unavailable.

## Behavior and supported scope

Workspace read access required. Returns the same customer-safe immutable receipt as reconciliation, without querying upstream or modifying usage or accounting. Absence, unknown attempt and out-of-scope attempt return 404. Quantities are decimal strings; missing categories remain null. Recorded does not guarantee settlement. No original raw upstream metadata, generation reference, credential, Provider price or endpoint is exposed. Cache-Control no-store. New v2 receipts retain terminal finish/cancellation evidence. Legacy v1 receipts retain null terminal fields without invented backfill.

**Supported scope:** implemented
