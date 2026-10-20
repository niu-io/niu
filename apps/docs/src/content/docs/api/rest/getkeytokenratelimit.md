---
title: "Read API key token rate policy"
description: "GET /api/v1/organizations/{organization}/projects/{project}/keys/{key}/token-rate-limit"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/keys/{key}/token-rate-limit`

Scoped readers may inspect the policy shared across secret rotations.

Operation: `getKeyTokenRateLimit`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/keys/{key}/token-rate-limit" \
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

Null revision means never configured. Null removes the limit; zero denies dispatch.

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
        "tokens_per_minute",
        "revision",
        "snapshot_at",
        "known_tokens",
        "reserved_tokens",
        "unbounded_requests",
        "committed_tokens"
      ],
      "properties": {
        "tokens_per_minute": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 0,
          "maximum": 1000000000000,
          "description": "Token budget includes unresolved reservations plus provider-reported usage completed in the last 60 seconds. Null is unlimited; zero denies dispatch."
        },
        "revision": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[1-9][0-9]*$"
        },
        "snapshot_at": {
          "type": "string",
          "format": "date-time"
        },
        "known_tokens": {
          "type": "string",
          "pattern": "^[0-9]+$",
          "description": "Known provider usage completed within 60 seconds."
        },
        "reserved_tokens": {
          "type": "string",
          "pattern": "^[0-9]+$",
          "description": "Estimates retained for unresolved usage, without time-based expiry."
        },
        "unbounded_requests": {
          "type": "integer",
          "minimum": 0,
          "description": "Unknown dispatched requests without a saved bound."
        },
        "committed_tokens": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[0-9]+$",
          "description": "Known plus reserved tokens, or null when unbounded requests prevent a complete total."
        }
      }
    }
  }
}
```

### HTTP 401

Authentication required

### HTTP 403

Workspace access denied

### HTTP 404

Workspace is outside operator scope, or key is absent from authorized workspace

## Behavior and supported scope

Scoped readers may inspect the policy shared across secret rotations.

**Supported scope:** implemented
