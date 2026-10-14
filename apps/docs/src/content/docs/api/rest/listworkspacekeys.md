---
title: "List workspace API keys with aggregated limits and policies"
description: "GET /api/v1/workspaces/{workspace}/keys"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/workspaces/{workspace}/keys`

Returns workspace API keys along with their current spending limits, request/token rate limits, concurrency limits, IP allowlist policy, and 60-second usage window in a single response.

Operation: `listWorkspaceKeys`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/workspaces/{workspace}/keys" \
  -H "Authorization: Bearer $NIU_API_KEY"
```

## Parameters

### workspace

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### after

Location: **query**. Optional.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Workspace keys with aggregated limits and policies

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "next_cursor": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    }
  }
}
```

## Behavior and supported scope

Returns workspace API keys along with their current spending limits, request/token rate limits, concurrency limits, IP allowlist policy, and 60-second usage window in a single response.

**Supported scope:** implemented
