---
title: "Inspect an authorization request after login"
description: "GET /api/v1/auth/agents/{code}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/auth/agents/{code}`

Requires a current user session. Returns only client name and state, never device secret or issued credential. Unknown and expired requests return 404; invalid session returns 401. Client label is self-reported. No-store.

Operation: `getAgentAuthorization`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/auth/agents/{code}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### code

Location: **path**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[0-9A-F]{12}$"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Request metadata

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "client_name",
        "state",
        "capabilities"
      ],
      "properties": {
        "client_name": {
          "type": "string"
        },
        "state": {
          "type": "string",
          "enum": [
            "pending",
            "approved",
            "denied",
            "consumed"
          ]
        },
        "capabilities": {
          "type": "array",
          "maxItems": 6,
          "uniqueItems": true,
          "items": {
            "type": "string",
            "enum": [
              "pools:read",
              "pools:write",
              "events:read",
              "events:write",
              "evaluations:read",
              "evaluations:write"
            ]
          },
          "description": "Additional workspace management rights, requiring explicit browser approval. Empty by default; no platform administration."
        }
      }
    }
  }
}
```

### HTTP 401

Sign-in required

### HTTP 404

Request unavailable or expired

## Behavior and supported scope

Requires a current user session. Returns only client name and state, never device secret or issued credential. Unknown and expired requests return 404; invalid session returns 401. Client label is self-reported. No-store.

**Supported scope:** implemented
