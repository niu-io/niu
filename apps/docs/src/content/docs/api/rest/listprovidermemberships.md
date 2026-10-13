---
title: "List the signed-in operator’s complete active Supplier memberships"
description: "GET /admin/v1/provider-memberships"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/provider-memberships`

Returns every active membership for the current non-revoked operator, ordered by Supplier name then internal routing ID. This compatibility directory has no cursor or silent history cap. Installation sessions return an empty list. Company membership alone grants no Supplier access. Deleted Suppliers are excluded. IDs are routing references, not display labels.

Operation: `listProviderMemberships`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/provider-memberships" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Complete current membership directory.

Response headers:

```json
{
  "Cache-Control": {
    "schema": {
      "type": "string",
      "const": "no-store"
    }
  }
}
```

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
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
          "role"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "name": {
            "type": "string"
          },
          "role": {
            "type": "string",
            "enum": [
              "manager",
              "viewer"
            ]
          }
        }
      }
    }
  }
}
```

### HTTP 401

Missing or unusable session.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Returns every active membership for the current non-revoked operator, ordered by Supplier name then internal routing ID. This compatibility directory has no cursor or silent history cap. Installation sessions return an empty list. Company membership alone grants no Supplier access. Deleted Suppliers are excluded. IDs are routing references, not display labels.

**Supported scope:** implemented
