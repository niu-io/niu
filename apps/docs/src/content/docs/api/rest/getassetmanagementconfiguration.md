---
title: "Read installation asset-management configuration metadata"
description: "GET /api/v1/vendors/{id}/asset-management"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/vendors/{id}/asset-management`

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/vendors/{id}/asset-management" \
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
