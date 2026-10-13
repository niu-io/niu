---
title: "List active Supplier business identities"
description: "GET /admin/v1/providers"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/providers`

Requires platform administration. Complete compatibility directory with no pagination or silent truncation, ordered by name and internal ID. Counts retain disabled credential configurations and models. Member counts include active memberships for non-revoked operators. Deleted Suppliers are excluded. Qualification is explicit and never inferred from configuration counts.

Operation: `listProviderBusinesses`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/providers" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Active directory

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
        "required": [
          "id",
          "name",
          "api_keys",
          "models",
          "members",
          "qualification_status"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "name": {
            "type": "string"
          },
          "api_keys": {
            "type": "integer",
            "minimum": 0
          },
          "models": {
            "type": "integer",
            "minimum": 0
          },
          "members": {
            "type": "integer",
            "minimum": 0
          },
          "qualification_status": {
            "type": "string",
            "enum": [
              "qualified",
              "unqualified"
            ]
          }
        }
      }
    }
  }
}
```

### HTTP 401

Missing, expired or revoked administrative credential

### HTTP 403

Platform administration required

### HTTP 503

Storage unavailable

## Behavior and supported scope

Requires platform administration. Complete compatibility directory with no pagination or silent truncation, ordered by name and internal ID. Counts retain disabled credential configurations and models. Member counts include active memberships for non-revoked operators. Deleted Suppliers are excluded. Qualification is explicit and never inferred from configuration counts.

**Supported scope:** implemented
