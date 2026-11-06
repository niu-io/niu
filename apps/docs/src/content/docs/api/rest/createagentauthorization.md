---
title: "Start coding-agent browser authorization"
description: "POST /api/v1/auth/agents"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/auth/agents`

Anonymous client request, limited using the trusted request source. Creates a ten-minute authorization request. Device secret is returned only to the agent; only the separate user code belongs in the browser URL. Client name is self-reported, not an authenticated application identity. No grants or inference occur. Responses are no-store.

Operation: `createAgentAuthorization`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/auth/agents" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

No path, query, or header parameters are declared.

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "client_name"
  ],
  "properties": {
    "client_name": {
      "type": "string",
      "enum": [
        "Claude Code",
        "Codex",
        "DeepSeek Harness"
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
    },
    "task": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200,
      "description": "Self-reported task context shown to the approver. It is not authority and is never used for backend permission checks."
    }
  }
}
```

## Responses

### HTTP 201

Request created

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "device_secret",
    "user_code",
    "verification_uri",
    "expires_in",
    "interval"
  ],
  "properties": {
    "device_secret": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$",
      "description": "Private polling capability; never put in a URL or log."
    },
    "user_code": {
      "type": "string",
      "pattern": "^[0-9A-F]{12}$"
    },
    "verification_uri": {
      "type": "string",
      "const": "/connect"
    },
    "expires_in": {
      "type": "integer",
      "const": 600
    },
    "interval": {
      "type": "integer",
      "const": 5
    }
  }
}
```

### HTTP 400

Unsupported client or invalid body

### HTTP 429

Creation admission limit reached

## Behavior and supported scope

Anonymous client request, limited using the trusted request source. Creates a ten-minute authorization request. Device secret is returned only to the agent; only the separate user code belongs in the browser URL. Client name is self-reported, not an authenticated application identity. No grants or inference occur. Responses are no-store.

**Supported scope:** implemented
