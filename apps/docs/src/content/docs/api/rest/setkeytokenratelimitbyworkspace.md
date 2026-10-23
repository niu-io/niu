---
title: "Set API key token rate policy"
description: "PUT /api/v1/workspaces/{workspace}/keys/{key}/token-rate-limit"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/workspaces/{workspace}/keys/{key}/token-rate-limit`

Owner or installation administrator only. Rotation preserves this policy. Does not cancel already admitted requests. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

Operation: `setKeyTokenRateLimitByWorkspace`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/workspaces/{workspace}/keys/{key}/token-rate-limit" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

### key

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
  "required": [
    "tokens_per_minute",
    "expected_revision"
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
    "expected_revision": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Zero for initial configuration; maximum 9223372036854775806."
    }
  }
}
```

## Responses

### HTTP 200

New policy and immutable history committed atomically. Existing unresolved work remains counted across revisions.

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
        "revision"
      ],
      "properties": {
        "revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid limit or revision

### HTTP 401

Authentication required

### HTTP 403

Owner permission required

### HTTP 404

Workspace is outside operator scope, or key is absent from authorized workspace

### HTTP 409

Stale policy revision

### HTTP 422

Missing or invalid JSON fields

## Behavior and supported scope

Owner or installation administrator only. Rotation preserves this policy. Does not cancel already admitted requests. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

**Supported scope:** implemented
