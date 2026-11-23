---
title: "Create or update an event subscription"
description: "PUT /v1/events/{slug}"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

`PUT /v1/events/{slug}`

**Before you start**

Use a current workspace API key with explicitly delegated `events:write`. Encryption must be configured. A workspace can retain up to 32 subscriptions.

**Create or update**

Revision zero creates a subscription. Updates require the current expected revision. Responses are no-store. Creation and `rotate_secret` each return one randomly generated signing secret, encrypted at rest and bound to the workspace and subscription. Changing the destination requires rotation.

**Delivery and recovery**

- Changing the destination, secret or enabled state starts delivery after the current stream head. Metadata edits preserve the processed cursor.
- Set `enabled=false` to revoke future deliveries while retaining history. In-flight requests cannot be recalled.
- This operation performs no inference or immediate delivery.
- On conflict, read the current state and reconcile. Never automatically replay an uncertain mutation that issues a secret.

Operation: `setEventSubscription`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/v1/events/{slug}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X PUT "$NIU_ORIGIN/v1/events/{slug}" \
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
    "configuration": {
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
    },
    "rotate_secret": {
      "type": "boolean",
      "default": false
    }
  },
  "required": [
    "configuration"
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
    },
    "signing_secret": {
      "type": "string",
      "writeOnly": false,
      "description": "Returned once on create or explicit rotation. Store privately; never included in ordinary reads/history. If response is lost, read back revision and explicitly rotate again; do not blindly replay."
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

**Before you start**

Use a current workspace API key with explicitly delegated `events:write`. Encryption must be configured. A workspace can retain up to 32 subscriptions.

**Create or update**

Revision zero creates a subscription. Updates require the current expected revision. Responses are no-store. Creation and `rotate_secret` each return one randomly generated signing secret, encrypted at rest and bound to the workspace and subscription. Changing the destination requires rotation.

**Delivery and recovery**

- Changing the destination, secret or enabled state starts delivery after the current stream head. Metadata edits preserve the processed cursor.
- Set `enabled=false` to revoke future deliveries while retaining history. In-flight requests cannot be recalled.
- This operation performs no inference or immediate delivery.
- On conflict, read the current state and reconcile. Never automatically replay an uncertain mutation that issues a secret.

**Supported scope:** implemented
