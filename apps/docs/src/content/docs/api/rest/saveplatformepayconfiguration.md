---
title: "Save encrypted EPay configuration with platform administrator write access"
description: "PUT /api/v1/platform/payments/epay"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/platform/payments/epay`

Validates enabled checkout configuration before persistence. An empty key retains the stored credential. Exact expected_revision prevents overwriting concurrent edits. Pending EPay orders prevent configuration changes so their original verification settings remain available. Saves an append-only audit event and takes effect without restarting the gateway. This configures the classic EPay protocol; it does not establish merchant eligibility or live payment qualification. Supported method names and uniqueness are validated even when disabled; a disabled draft may use an empty methods list.

Operation: `savePlatformEPayConfiguration`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/platform/payments/epay" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN" \
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
    "expected_revision",
    "enabled",
    "merchant_id",
    "key",
    "endpoint",
    "notify_url",
    "return_url",
    "methods"
  ],
  "properties": {
    "expected_revision": {
      "type": "string",
      "pattern": "^[0-9]+$"
    },
    "enabled": {
      "type": "boolean"
    },
    "merchant_id": {
      "type": "string"
    },
    "key": {
      "type": "string",
      "writeOnly": true
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
    "methods": {
      "type": "array",
      "maxItems": 2,
      "uniqueItems": true,
      "items": {
        "type": "string",
        "enum": [
          "alipay",
          "wxpay"
        ]
      }
    }
  }
}
```

## Responses

### HTTP 200

Sanitized saved configuration in data, without key

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

### HTTP 400

Invalid configuration

### HTTP 401

Authentication required

### HTTP 403

Platform administrator write access required

### HTTP 409

Revision conflict or unresolved payment orders

### HTTP 422

Malformed JSON shape, missing fields or unknown fields

### HTTP 502

Encryption unavailable or stored configuration cannot be opened

### HTTP 503

Durable storage unavailable

## Behavior and supported scope

Validates enabled checkout configuration before persistence. An empty key retains the stored credential. Exact expected_revision prevents overwriting concurrent edits. Pending EPay orders prevent configuration changes so their original verification settings remain available. Saves an append-only audit event and takes effect without restarting the gateway. This configures the classic EPay protocol; it does not establish merchant eligibility or live payment qualification. Supported method names and uniqueness are validated even when disabled; a disabled draft may use an empty methods list.

**Supported scope:** implemented
