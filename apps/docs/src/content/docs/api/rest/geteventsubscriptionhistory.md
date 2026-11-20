---
title: "Read subscription configuration history"
description: "GET /v1/events/{slug}/history"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/events/{slug}/history`

Requires a current workspace API key with explicitly delegated events:read. Responses are no-store. Immutable configuration snapshots, newest revision first, at most 100. Follow next_before when present. No signing credentials or ciphertext are included.

Operation: `getEventSubscriptionHistory`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/events/{slug}/history" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/events/{slug}/history" \
  -H "X-Niu-API-Key: $NIU_API_KEY"
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

### before

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Scoped result

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "slug": {
            "type": "string",
            "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
            "maxLength": 80
          },
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200
          },
          "endpoint": {
            "type": "string",
            "format": "uri",
            "maxLength": 2048,
            "description": "Public HTTPS URL, port 443 only, no username/password/query/fragment. Public-address validation and pinning apply at delivery."
          },
          "event_types": {
            "type": "array",
            "minItems": 1,
            "maxItems": 4,
            "items": {
              "type": "string",
              "enum": [
                "pool.changed",
                "evaluation.recorded",
                "incident.opened",
                "incident.resolved"
              ]
            },
            "uniqueItems": true
          },
          "enabled": {
            "type": "boolean"
          },
          "revision": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740990
          }
        },
        "required": [
          "slug",
          "name",
          "endpoint",
          "event_types",
          "enabled",
          "revision"
        ],
        "additionalProperties": false
      }
    },
    "next_before": {
      "type": [
        "integer",
        "null"
      ]
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

Requires a current workspace API key with explicitly delegated events:read. Responses are no-store. Immutable configuration snapshots, newest revision first, at most 100. Follow next_before when present. No signing credentials or ciphertext are included.

**Supported scope:** implemented
