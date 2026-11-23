---
title: "Read Provider business profile"
description: "GET /api/v1/admin/providers/{provider}"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

`GET /api/v1/admin/providers/{provider}`

Requires platform management permission. Returns business display metadata and an integer profile revision. Optional descriptive text and URLs are represented as empty strings when unset. Does not return credentials, procurement prices or review evidence. Internal identity is for routing, not display.

Operation: `getProviderProfile`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/admin/providers/{provider}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### provider

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### provider

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

Saved Provider profile

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
        "name",
        "description",
        "website_url",
        "logo_url",
        "model_access_mode",
        "default_discount_bps",
        "allowlisted_models",
        "blocklisted_models",
        "id",
        "revision",
        "slug"
      ],
      "properties": {
        "name": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "website_url": {
          "type": "string"
        },
        "logo_url": {
          "type": "string"
        },
        "model_access_mode": {
          "type": "string",
          "enum": [
            "all",
            "allowlist",
            "blocklist"
          ],
          "description": "Provider model availability policy: all (default), allowlist or blocklist."
        },
        "default_discount_bps": {
          "type": "integer",
          "minimum": 10,
          "maximum": 100000,
          "description": "Default purchase rate percentage in basis points (10000 = 100%, no discount)."
        },
        "allowlisted_models": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Explicitly enabled model aliases when model_access_mode is allowlist."
        },
        "blocklisted_models": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Explicitly excluded model aliases when model_access_mode is blocklist."
        },
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "revision": {
          "type": "integer",
          "format": "int64"
        },
        "slug": {
          "type": "string",
          "maxLength": 48,
          "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
          "description": "Stable readable slug for product URLs. Renaming preserves it."
        }
      }
    }
  }
}
```

### HTTP 400

Invalid identifier

### HTTP 401

Authentication required

### HTTP 403

Platform management permission required

### HTTP 404

Provider missing or deleted

### HTTP 503

Storage unavailable

## Behavior and supported scope

Requires platform management permission. Returns business display metadata and an integer profile revision. Optional descriptive text and URLs are represented as empty strings when unset. Does not return credentials, procurement prices or review evidence. Internal identity is for routing, not display.

**Supported scope:** implemented
