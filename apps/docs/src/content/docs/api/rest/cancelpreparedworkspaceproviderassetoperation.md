---
title: "Abandon an unclaimed native operation after key expiry"
description: "POST /api/v1/organizations/{organization}/projects/{project}/media/operations/{id}/cancel"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/projects/{project}/media/operations/{id}/cancel`

Current member workspace Write permission required, independent of inference-key expiry or revocation. Native operation history is workspace-shared. Exact workspace, Niu operation and immutable group model binding are checked under group-first locks. Only prepared becomes not_sent; unknown is never resolved, resent or canceled. No Provider client, calls, route reenabling or inference authority restoration. Repeated not_sent cancellation is unchanged. Original key and private account binding remain immutable.

Operation: `cancelPreparedWorkspaceProviderAssetOperation`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/media/operations/{id}/cancel" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  --url-query 'model=<MODEL>'
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

### id

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### model

Location: **query**. **Required.**

```json
{
  "type": "string"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Preparation abandoned before claim

Response headers:

```json
{
  "Cache-Control": {
    "schema": {
      "type": "string"
    },
    "description": "no-store"
  }
}
```

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
        "status"
      ],
      "properties": {
        "status": {
          "type": "string",
          "const": "not_sent"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid path or query

### HTTP 401

Invalid member session

### HTTP 403

Current workspace Write denied

### HTTP 409

Unknown, acknowledged, foreign or mismatched model preparation

### HTTP 503

Storage unavailable

## Behavior and supported scope

Current member workspace Write permission required, independent of inference-key expiry or revocation. Native operation history is workspace-shared. Exact workspace, Niu operation and immutable group model binding are checked under group-first locks. Only prepared becomes not_sent; unknown is never resolved, resent or canceled. No Provider client, calls, route reenabling or inference authority restoration. Repeated not_sent cancellation is unchanged. Original key and private account binding remain immutable.

**Supported scope:** implemented
