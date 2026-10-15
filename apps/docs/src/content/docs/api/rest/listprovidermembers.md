---
title: "List Provider business members"
description: "GET /api/v1/providers/{provider}/members"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/providers/{provider}/members`

Requires platform management permission. Lists saved memberships ordered by member name and internal identity. active is false when membership is disabled or the member account is revoked; revoked reports account revocation separately. No tokens, merchant secrets or procurement amounts are returned. Internal operator identities are for routing, not product labels.

Operation: `listProviderMembers`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/providers/{provider}/members" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
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

## Request body

No request body is declared.

## Responses

### HTTP 200

Saved membership list, including inactive or revoked members

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
          "operator_id",
          "name",
          "role",
          "active",
          "revoked"
        ],
        "properties": {
          "operator_id": {
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
          },
          "active": {
            "type": "boolean"
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

Invalid identifier

### HTTP 401

Authentication required

### HTTP 403

Platform management permission required

### HTTP 409

Provider missing or deleted

### HTTP 503

Storage unavailable

## Behavior and supported scope

Requires platform management permission. Lists saved memberships ordered by member name and internal identity. active is false when membership is disabled or the member account is revoked; revoked reports account revocation separately. No tokens, merchant secrets or procurement amounts are returned. Internal operator identities are for routing, not product labels.

**Supported scope:** implemented
