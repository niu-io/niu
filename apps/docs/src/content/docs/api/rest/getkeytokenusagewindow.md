---
title: "Read API key token usage window"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/token-usage-window"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/token-usage-window`

Scoped reader access. Dispatches in the rolling 60 seconds ending at window_end, across secret rotations. Known subtotals exclude unknown requests; zero known tokens does not mean zero actual usage. This endpoint does not enforce TPM and exposes no Supplier cost.

Operation: `getKeyTokenUsageWindow`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/token-usage-window" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
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

### key

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

One consistent database snapshot, including an empty window for an unused key.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "required": [
        "window_seconds",
        "window_end",
        "requests",
        "known_usage_requests",
        "unknown_usage_requests",
        "known_prompt_tokens",
        "known_completion_tokens"
      ],
      "properties": {
        "window_seconds": {
          "type": "integer",
          "const": 60
        },
        "window_end": {
          "type": "string",
          "format": "date-time"
        },
        "requests": {
          "type": "integer",
          "minimum": 0
        },
        "known_usage_requests": {
          "type": "integer",
          "minimum": 0
        },
        "unknown_usage_requests": {
          "type": "integer",
          "minimum": 0
        },
        "known_prompt_tokens": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "known_completion_tokens": {
          "type": "string",
          "pattern": "^[0-9]+$"
        }
      }
    }
  }
}
```

### HTTP 401

Authentication required

### HTTP 403

Read permission required

### HTTP 404

Workspace outside operator scope or key absent from workspace

## Behavior and supported scope

Scoped reader access. Dispatches in the rolling 60 seconds ending at window_end, across secret rotations. Known subtotals exclude unknown requests; zero known tokens does not mean zero actual usage. This endpoint does not enforce TPM and exposes no Supplier cost.

**Supported scope:** implemented
