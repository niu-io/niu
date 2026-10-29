---
title: "List Provider API-key configurations without credentials"
description: "GET /api/v1/vendors"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/vendors`

Returns every matching configuration, including disabled configurations, in one data array. Optional Provider filtering uses explicit business ownership. No pagination or silent row cap; response memory grows with list size. Requires installation administration or an explicitly granted platform administrator. Each configuration has independent credentials and model bindings. Credentials are write-only and never returned.

Operation: `listVendors`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/vendors" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### supplier

Location: **query**. Optional. Filter by explicit Provider business ownership; no name matching or unassociated fallback. Platform administration is required. A missing or deleted Provider returns 404; an active Provider without configurations returns an empty data array.

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

Vendor metadata. All management responses use Cache-Control no-store.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
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
}
```

### HTTP 401

Invalid or expired administrative credential.

### HTTP 403

Platform administration permission required.

### HTTP 404

Selected Provider does not exist or has been deleted.

## Behavior and supported scope

Returns every matching configuration, including disabled configurations, in one data array. Optional Provider filtering uses explicit business ownership. No pagination or silent row cap; response memory grows with list size. Requires installation administration or an explicitly granted platform administrator. Each configuration has independent credentials and model bindings. Credentials are write-only and never returned.

**Supported scope:** implemented
