---
title: "Read API key request rate policy"
description: "GET /api/v1/workspaces/{workspace}/keys/{key}/request-rate-limit"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/workspaces/{workspace}/keys/{key}/request-rate-limit`

Scoped readers may inspect the policy shared across secret rotations. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

Operation: `getKeyRequestRateLimitByWorkspace`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/workspaces/{workspace}/keys/{key}/request-rate-limit" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
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
        "requests_per_minute",
        "revision"
      ],
      "properties": {
        "requests_per_minute": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 0,
          "maximum": 1000000,
          "description": "Maximum dispatches per rolling 60 seconds; null is unlimited and zero denies dispatch."
        },
        "revision": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[1-9][0-9]*$"
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

Scoped readers may inspect the policy shared across secret rotations. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

**Supported scope:** implemented
