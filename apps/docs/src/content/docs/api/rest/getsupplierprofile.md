---
title: "Read Supplier business profile"
description: "GET /admin/v1/providers/{provider}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/providers/{provider}`

Requires platform management permission. Returns business display metadata and an integer profile revision. Optional descriptive text and URLs are represented as empty strings when unset. Does not return credentials, procurement prices or qualification evidence. Internal identity is for routing, not display.

Operation: `getSupplierProfile`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/providers/{provider}" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
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

Saved Supplier profile

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
        "id",
        "revision"
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
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "revision": {
          "type": "integer",
          "format": "int64"
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

Supplier missing or deleted

### HTTP 503

Storage unavailable

## Behavior and supported scope

Requires platform management permission. Returns business display metadata and an integer profile revision. Optional descriptive text and URLs are represented as empty strings when unset. Does not return credentials, procurement prices or qualification evidence. Internal identity is for routing, not display.

**Supported scope:** implemented
