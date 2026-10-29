---
title: "Read EPay configuration with platform administrator read access"
description: "GET /api/v1/platform/payments/epay"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/platform/payments/epay`

Returns enabled, merchant_id, endpoint, notify_url, return_url, methods, has_key and an exact string revision. Never returns merchant keys. Without a saved configuration, reads sanitized deployment defaults.

Operation: `getPlatformEPayConfiguration`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/platform/payments/epay" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Sanitized configuration in data

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
      "additionalProperties": false,
      "required": [
        "merchant_id",
        "endpoint",
        "notify_url",
        "return_url",
        "revision",
        "enabled",
        "has_key",
        "methods"
      ],
      "properties": {
        "merchant_id": {
          "type": "string"
        },
        "endpoint": {
          "type": "string",
          "description": "HTTPS gateway base or complete submit.php endpoint. A base path gets /submit.php appended; a supplied submit.php is preserved, including subdirectories. Trailing slashes are normalized. Query strings, fragments and URL credentials are rejected. The complete encoded checkout must fit 2048 bytes for the largest supported order and amount; invalid enabled configuration is rejected before persistence. Existing saved checkout URLs are not rewritten."
        },
        "notify_url": {
          "type": "string"
        },
        "return_url": {
          "type": "string"
        },
        "revision": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "enabled": {
          "type": "boolean"
        },
        "has_key": {
          "type": "boolean"
        },
        "methods": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Saved methods or deployment defaults; legacy disabled configurations may contain unsupported values. Writes accept only alipay and wxpay."
        }
      }
    }
  }
}
```

### HTTP 401

Authentication required

### HTTP 403

Platform administrator access required

### HTTP 502

Encryption unavailable or stored configuration cannot be opened

### HTTP 503

Durable storage unavailable

## Behavior and supported scope

Returns enabled, merchant_id, endpoint, notify_url, return_url, methods, has_key and an exact string revision. Never returns merchant keys. Without a saved configuration, reads sanitized deployment defaults.

**Supported scope:** implemented
