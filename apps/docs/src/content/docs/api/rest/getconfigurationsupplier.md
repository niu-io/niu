---
title: "Read the Supplier owning an API configuration"
description: "GET /admin/v1/vendors/{id}/supplier"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/vendors/{id}/supplier`

Installation credential or explicitly granted platform administrator required. Supplier membership and customer ownership alone do not grant access. Returns the Supplier identity and name, or null when no association exists, including an unknown configuration. Never returns credentials or procurement values.

Operation: `getConfigurationSupplier`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/vendors/{id}/supplier" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
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

No request body is declared.

## Responses

### HTTP 200

Supplier association or null.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "oneOf": [
        {
          "type": "null"
        },
        {
          "type": "object",
          "required": [
            "id",
            "name"
          ],
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
      ]
    }
  }
}
```

### HTTP 401

Invalid or missing administrative credential.

### HTTP 403

Installation administration required.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Installation credential or explicitly granted platform administrator required. Supplier membership and customer ownership alone do not grant access. Returns the Supplier identity and name, or null when no association exists, including an unknown configuration. Never returns credentials or procurement values.

**Supported scope:** implemented
