---
title: "Read immutable operator and session lifecycle events"
description: "GET /api/v1/operators/{operator}/events"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/operators/{operator}/events`

Requires a scoped owner for the target operator or an installation bootstrap credential. Cursor UUIDs are accepted only when they belong to the requested target operator. Events include actor class/identity and target tenant metadata, never session tokens, token hashes or request bodies.

Operation: `adminListOperatorAuditEvents`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/operators/{operator}/events" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
```

## Parameters

### operator

Location: **path**. **Required.**

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
  "default": 50
}
```

### cursor

Location: **query**. Optional. UUID from next_cursor in the previous page for this same operator.

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

Events in stable descending created_at/id order and a nullable next_cursor.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data",
    "next_cursor"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "action",
          "actor_kind",
          "actor_operator_id",
          "target_operator_id",
          "target_session_id",
          "organization_id",
          "project_id",
          "before_role",
          "after_role",
          "created_at"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "action": {
            "type": "string",
            "enum": [
              "operator_created",
              "session_created",
              "session_revoked",
              "operator_revoked",
              "password_changed",
              "password_login_succeeded",
              "role_changed"
            ]
          },
          "actor_kind": {
            "type": "string",
            "enum": [
              "installation",
              "operator"
            ]
          },
          "actor_operator_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid",
            "description": "Null only for installation actors."
          },
          "target_operator_id": {
            "type": "string",
            "format": "uuid"
          },
          "target_session_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid",
            "description": "Present for session creation",
            "revocation and password login; role changes apply to the member and have no target session.": null
          },
          "organization_id": {
            "type": "string",
            "format": "uuid"
          },
          "project_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "before_role": {
            "type": [
              "string",
              "null"
            ],
            "enum": [
              "owner",
              "admin",
              "viewer",
              null
            ],
            "description": "Recorded original role for role_changed; null for other events."
          },
          "after_role": {
            "type": [
              "string",
              "null"
            ],
            "enum": [
              "owner",
              "admin",
              "viewer",
              null
            ],
            "description": "Recorded new role for role_changed; null for other events."
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          }
        }
      }
    },
    "next_cursor": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    }
  }
}
```

### HTTP 400

Page limit is outside 1–100 or cursor is absent from this operator's event stream.

### HTTP 401

Missing, invalid, expired or revoked credentials.

### HTTP 403

The authenticated operator is not an owner.

### HTTP 404

Target operator is absent or outside the caller's scope.

## Behavior and supported scope

Requires a scoped owner for the target operator or an installation bootstrap credential. Cursor UUIDs are accepted only when they belong to the requested target operator. Events include actor class/identity and target tenant metadata, never session tokens, token hashes or request bodies.
