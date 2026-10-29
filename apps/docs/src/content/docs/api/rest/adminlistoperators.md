---
title: "List operator identities without session credentials"
description: "GET /api/v1/operators"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/operators`

Requires an owner or installation administrator. Results are scoped before pagination. Installation callers may filter by organization_id; members cannot change their authorized company/workspace scope. Returns identities and roles, never session credentials. Pass next_cursor as after until null. A missing or foreign cursor returns 409. Pages are live observations ordered by creation time and identity.

Operation: `adminListOperators`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/operators" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

### organization_id

Location: **query**. Optional.

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
  "maximum": 1000,
  "default": 1000
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Persistent operator identities and assigned roles.

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
      "items": {
        "type": "object",
        "required": [
          "id",
          "name",
          "role",
          "organization_id",
          "project_id",
          "revoked"
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
              "owner",
              "admin",
              "viewer"
            ]
          },
          "organization_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "project_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "revoked": {
            "type": "boolean"
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid page limit, cursor syntax or unknown query field.

### HTTP 401

Missing, invalid, expired or revoked credentials.

### HTTP 403

The authenticated operator is not an owner.

### HTTP 404

Requested company is outside the member scope.

### HTTP 409

Cursor is missing or outside the selected scope; refresh the directory.

## Behavior and supported scope

Requires an owner or installation administrator. Results are scoped before pagination. Installation callers may filter by organization_id; members cannot change their authorized company/workspace scope. Returns identities and roles, never session credentials. Pass next_cursor as after until null. A missing or foreign cursor returns 409. Pages are live observations ordered by creation time and identity.
