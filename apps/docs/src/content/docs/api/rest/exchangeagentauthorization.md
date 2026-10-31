---
title: "Exchange an approved agent request for scoped access"
description: "POST /api/v1/auth/agents/token"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/auth/agents/token`

Agent supplies the private device secret. Pending polls are durably limited to a five-second interval. Approved exchange atomically issues one finite workspace model API key and consumes the request. Repeat, denied, expired or revoked-approver exchanges are refused. A lost successful response cannot retrieve the secret; review/revoke the issued key before a new authorization. No-store. This grants inference and request evidence access, not platform administration.

Operation: `exchangeAgentAuthorization`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/auth/agents/token" \
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
    "device_secret"
  ],
  "properties": {
    "device_secret": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    }
  }
}
```

## Responses

### HTTP 200

Credential delivered once

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "token",
    "token_type"
  ],
  "properties": {
    "token": {
      "type": "string",
      "pattern": "^niu_[0-9a-f]{64}$"
    },
    "token_type": {
      "type": "string",
      "const": "Bearer"
    }
  }
}
```

### HTTP 202

Approval pending

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "status",
    "interval"
  ],
  "properties": {
    "status": {
      "type": "string",
      "const": "authorization_pending"
    },
    "interval": {
      "type": "integer",
      "const": 5
    }
  }
}
```

### HTTP 401

Unknown, denied, expired, consumed or revoked approval

### HTTP 429

Poll interval exceeded

## Behavior and supported scope

Agent supplies the private device secret. Pending polls are durably limited to a five-second interval. Approved exchange atomically issues one finite workspace model API key and consumes the request. Repeat, denied, expired or revoked-approver exchanges are refused. A lost successful response cannot retrieve the secret; review/revoke the issued key before a new authorization. No-store. This grants inference and request evidence access, not platform administration.

**Supported scope:** implemented
