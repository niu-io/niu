---
title: "Discover saved asset group creation requests"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/asset-group-intents"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/asset-group-intents`

Workspace-scoped local metadata only; no upstream query or asset-readiness claim. IDs and cursors are internal routing references and must not be displayed as labels. Expired and deleted request names are omitted as null. Supplier bindings, credentials, fingerprints and procurement data are excluded.

Operation: `listAssetGroupRequests`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/asset-group-intents" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

### organization

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### project

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### after

Location: **query**. Optional.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 30
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Bounded page in routing-reference order; Cache-Control no-store.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_cursor"
  ],
  "properties": {
    "next_cursor": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    },
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "name",
          "status",
          "created_at",
          "request_content_status"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "name": {
            "type": [
              "string",
              "null"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "prepared",
              "dispatching",
              "uncertain",
              "succeeded"
            ]
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "request_content_status": {
            "type": "string",
            "enum": [
              "retained",
              "deleted",
              "expired"
            ]
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid cursor, limit or query field.

### HTTP 401

Member or installation session required.

### HTTP 403

Workspace read permission required.

### HTTP 404

Workspace unavailable to this caller.

## Behavior and supported scope

Workspace-scoped local metadata only; no upstream query or asset-readiness claim. IDs and cursors are internal routing references and must not be displayed as labels. Expired and deleted request names are omitted as null. Supplier bindings, credentials, fingerprints and procurement data are excluded.
