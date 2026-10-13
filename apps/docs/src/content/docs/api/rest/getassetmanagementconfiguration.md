---
title: "Read installation asset-management configuration metadata"
description: "GET /admin/v1/vendors/{id}/asset-management"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/vendors/{id}/asset-management`

Installation administrator only. Returns no Access Key, secret or ciphertext. Configuration does not enable asset dispatch.

Operation: `getAssetManagementConfiguration`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "adminBearerAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/vendors/{id}/asset-management" \
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

Latest metadata, or null before setup. Cache-Control no-store.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "anyOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "revision",
            "upstream_project",
            "configured",
            "dispatch_available"
          ],
          "properties": {
            "revision": {
              "type": "integer",
              "minimum": 1
            },
            "upstream_project": {
              "type": "string"
            },
            "configured": {
              "type": "boolean"
            },
            "dispatch_available": {
              "type": "boolean",
              "const": false
            }
          }
        },
        {
          "type": "null"
        }
      ]
    }
  }
}
```

### HTTP 403

Installation administrator required.

### HTTP 404

Credential configuration not found.

## Behavior and supported scope

Installation administrator only. Returns no Access Key, secret or ciphertext. Configuration does not enable asset dispatch.
