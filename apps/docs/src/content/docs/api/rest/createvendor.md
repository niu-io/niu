---
title: "Create an encrypted Provider API-key configuration"
description: "POST /api/v1/vendors"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/vendors`

 Requires installation administration or an explicitly granted platform administrator. Each configuration has independent credentials and model bindings. Credentials are write-only and never returned.

Operation: `createVendor`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/vendors" \
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
    "name",
    "adapter",
    "api_base",
    "api_key"
  ],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
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
      "format": "uri",
      "maxLength": 2048,
      "description": "HTTPS endpoint or HTTP loopback endpoint without URL credentials or query parameters."
    },
    "api_key": {
      "type": "string",
      "writeOnly": true,
      "minLength": 1,
      "maxLength": 8192
    },
    "enabled": {
      "type": "boolean",
      "default": true
    },
    "supplier_id": {
      "type": "string",
      "format": "uuid",
      "description": "Existing Provider business to own this API-key configuration. Mutually exclusive with create_supplier=true; ownership and creation commit atomically."
    },
    "create_supplier": {
      "type": "boolean",
      "default": false,
      "description": "Atomically create a Provider business with this name and its explicit configuration ownership link. Omission preserves legacy configuration-only creation."
    }
  }
}
```

## Responses

### HTTP 201

Created vendor metadata wrapped in data. The credential is never returned.

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

Invalid vendor configuration.

### HTTP 401

Invalid or expired administrative credential.

### HTTP 403

Platform administration permission required.

### HTTP 409

Vendor name already exists.

### HTTP 503

Storage or credential encryption unavailable.

## Behavior and supported scope

 Requires installation administration or an explicitly granted platform administrator. Each configuration has independent credentials and model bindings. Credentials are write-only and never returned.

**Supported scope:** implemented
