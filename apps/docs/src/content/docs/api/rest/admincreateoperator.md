---
title: "Create an operator and issue its first session token"
description: "POST /api/v1/operators"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/operators`

Requires a workspace owner or a configured bootstrap administrator token. Every operator must be bound to an organization and may optionally be limited to one project. The bearer token is returned once and is never retrievable from list APIs.

Operation: `adminCreateOperator`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/operators" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

No path, query, or header parameters are declared.

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "organization_id",
    "name",
    "role",
    "expires_in_seconds"
  ],
  "properties": {
    "organization_id": {
      "type": "string",
      "format": "uuid"
    },
    "project_id": {
      "type": "string",
      "format": "uuid",
      "description": "Optional project-level restriction within the organization."
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "role": {
      "type": "string",
      "enum": [
        "owner",
        "admin",
        "viewer"
      ]
    },
    "expires_in_seconds": {
      "type": "integer",
      "minimum": 60,
      "maximum": 31536000
    }
  }
}
```

## Responses

### HTTP 201

Operator and session created; response includes Cache-Control no-store.

### HTTP 400

Invalid role, name or session lifetime.

### HTTP 401

Missing, invalid, expired or revoked credentials.

### HTTP 403

The authenticated operator is not an owner.

## Behavior and supported scope

Requires a workspace owner or a configured bootstrap administrator token. Every operator must be bound to an organization and may optionally be limited to one project. The bearer token is returned once and is never retrievable from list APIs.
