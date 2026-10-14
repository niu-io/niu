---
title: "Update one Provider API-key configuration or rotate its credential"
description: "PUT /admin/v1/vendors/{id}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /admin/v1/vendors/{id}`

Adapter is immutable. Changes affect new requests; already dispatched work can finish using its original configuration. Requires installation administration or an explicitly granted platform administrator. Each configuration has independent credentials and model bindings. Credentials are write-only and never returned.

Operation: `updateVendor`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/admin/v1/vendors/{id}" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### id

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
    "name",
    "api_base",
    "enabled",
    "expected_revision"
  ],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "api_base": {
      "type": "string",
      "format": "uri",
      "maxLength": 2048
    },
    "api_key": {
      "type": "string",
      "writeOnly": true,
      "minLength": 1,
      "maxLength": 8192,
      "description": "Omit to retain the current credential."
    },
    "enabled": {
      "type": "boolean"
    },
    "expected_revision": {
      "type": "integer",
      "minimum": 1
    }
  }
}
```

## Responses

### HTTP 200

Updated vendor metadata wrapped in data.

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
        "id",
        "name",
        "adapter",
        "api_base",
        "enabled",
        "revision",
        "has_credential"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "name": {
          "type": "string"
        },
        "adapter": {
          "type": "string",
          "enum": [
            "openrouter",
            "openai",
            "anthropic",
            "gemini",
            "ark"
          ]
        },
        "api_base": {
          "type": "string",
          "format": "uri"
        },
        "enabled": {
          "type": "boolean"
        },
        "revision": {
          "type": "integer",
          "minimum": 1
        },
        "has_credential": {
          "type": "boolean"
        },
        "owner_funded": {
          "type": "boolean",
          "readOnly": true,
          "description": "Configuration-list metadata identifying a private credential owned by one account. Not accepted in configuration writes."
        },
        "supplier": {
          "type": [
            "object",
            "null"
          ],
          "description": "Provider ownership on configuration-list reads; credentials and commercial data are excluded.",
          "required": [
            "id",
            "name"
          ],
          "additionalProperties": false,
          "properties": {
            "id": {
              "type": "string",
              "format": "uuid"
            },
            "name": {
              "type": "string"
            }
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid configuration or credential.

### HTTP 401

Invalid or expired administrative credential.

### HTTP 403

Platform administration permission required.

### HTTP 404

Vendor does not exist.

### HTTP 409

Stale revision or conflicting name.

## Behavior and supported scope

Adapter is immutable. Changes affect new requests; already dispatched work can finish using its original configuration. Requires installation administration or an explicitly granted platform administrator. Each configuration has independent credentials and model bindings. Credentials are write-only and never returned.

**Supported scope:** implemented
