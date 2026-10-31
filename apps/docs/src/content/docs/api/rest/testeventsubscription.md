---
title: "Queue a signed subscription test"
description: "POST /v1/events/{slug}/test"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/events/{slug}/test`

Requires a current workspace API key with explicitly delegated events:write. Responses are no-store. Requires the current expected revision, enabled subscription and current original delegation. Appends a subscription.test event targeted only to this subscription and queues asynchronous delivery. The receipt is not a receiver acknowledgement; inspect deliveries afterward. The signed event is observable in the workspace event log. No inference occurs. Repeating this request creates another distinct test; do not replay an uncertain response blindly.

Operation: `testEventSubscription`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  },
  {
    "niuApiKeyAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

Authentication alternative: `bearerAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/events/{slug}/test" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/events/{slug}/test" \
  -H "X-Niu-API-Key: $NIU_API_KEY" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### slug

Location: **path**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
  "maxLength": 80
}
```

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "properties": {
    "revision": {
      "type": "integer",
      "minimum": 1
    }
  },
  "required": [
    "revision"
  ],
  "additionalProperties": false
}
```

## Responses

### HTTP 200

Scoped result

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "sequence": {
          "type": "string"
        },
        "type": {
          "type": "string",
          "const": "subscription.test"
        },
        "subscription_revision": {
          "type": "integer"
        },
        "delivery": {
          "type": "string",
          "const": "queued"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid configuration or cursor

### HTTP 401

Invalid, expired or revoked key

### HTTP 403

Required current delegation is absent

### HTTP 404

Scoped subscription not found

### HTTP 409

Revision, quota or cursor conflict

### HTTP 503

Required encryption or storage unavailable

## Behavior and supported scope

Requires a current workspace API key with explicitly delegated events:write. Responses are no-store. Requires the current expected revision, enabled subscription and current original delegation. Appends a subscription.test event targeted only to this subscription and queues asynchronous delivery. The receipt is not a receiver acknowledgement; inspect deliveries afterward. The signed event is observable in the workspace event log. No inference occurs. Repeating this request creates another distinct test; do not replay an uncertain response blindly.

**Supported scope:** implemented
