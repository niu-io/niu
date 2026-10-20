---
title: "Change a scoped customer member role"
description: "PATCH /api/v1/operators/{operator}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PATCH /api/v1/operators/{operator}`

Current scoped Owner management permission or installation administrator required. Admin and Viewer cannot manage user roles. Preserves the original member organization/workspace, credentials, sessions, session expiries and Provider memberships. Rejects self role changes, revoked/noncustomer/platform actors and role-update demotion of the last applicable active Owner. expected_role is a compare-and-set precondition; stale input returns 409 and requires reloading. Organization-scoped serialization and current actor/session validation protect the mutation transaction. A same-role request with a matching precondition returns unchanged metadata without an audit event. Changed roles apply to the original token on its next authenticated request; no replacement token or renewed session is issued. A future immutable role_changed journal records exact before/after roles and actor attribution; historical roles are never inferred. No credentials or commercial data returned.

Operation: `updateOperatorRole`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X PATCH "$NIU_ORIGIN/api/v1/operators/{operator}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### operator

Location: **path**. **Required.** Scoped Niu user routing reference; never display as a product label.

```json
{
  "type": "string",
  "format": "uuid"
}
```

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "role",
    "expected_role"
  ],
  "properties": {
    "role": {
      "type": "string",
      "enum": [
        "owner",
        "admin",
        "viewer"
      ]
    },
    "expected_role": {
      "type": "string",
      "enum": [
        "owner",
        "admin",
        "viewer"
      ]
    }
  }
}
```

## Responses

### HTTP 200

Current scoped user metadata; no credential or session renewal

Response headers:

```json
{
  "Cache-Control": {
    "schema": {
      "type": "string"
    },
    "description": "no-store"
  }
}
```

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
```

### HTTP 400

Invalid role/input or protected customer actor

### HTTP 401

Invalid, expired or concurrently revoked management session

### HTTP 403

Manage-users permission denied or self role change

### HTTP 404

User outside the actor scope or not a customer user

### HTTP 409

Stale expected role, revoked user or last Owner protection

### HTTP 413

Body exceeds bounded request size

### HTTP 503

Storage unavailable

## Behavior and supported scope

Current scoped Owner management permission or installation administrator required. Admin and Viewer cannot manage user roles. Preserves the original member organization/workspace, credentials, sessions, session expiries and Provider memberships. Rejects self role changes, revoked/noncustomer/platform actors and role-update demotion of the last applicable active Owner. expected_role is a compare-and-set precondition; stale input returns 409 and requires reloading. Organization-scoped serialization and current actor/session validation protect the mutation transaction. A same-role request with a matching precondition returns unchanged metadata without an audit event. Changed roles apply to the original token on its next authenticated request; no replacement token or renewed session is issued. A future immutable role_changed journal records exact before/after roles and actor attribution; historical roles are never inferred. No credentials or commercial data returned.

**Supported scope:** implemented
