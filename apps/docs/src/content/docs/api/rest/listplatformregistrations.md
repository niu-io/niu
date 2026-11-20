---
title: "List Limited Preview registration requests"
description: "GET /api/v1/platform/registrations"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/platform/registrations`

Platform administration required. Returns submitted registration requests, counts by status, and the current policy. Password hashes are never returned.

Operation: `listPlatformRegistrations`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/platform/registrations" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### status

Location: **query**. Optional.

```json
{
  "type": "string",
  "enum": [
    "pending",
    "approved",
    "rejected"
  ]
}
```

### cursor

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
  "default": 50
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Registration requests page and summary counts.

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
    "data",
    "next_cursor",
    "counts",
    "policy"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "email",
          "applicant_name",
          "organization_name",
          "workspace_name",
          "note",
          "status",
          "revision",
          "created_at",
          "reviewed_at",
          "reviewed_by_kind",
          "reviewed_by_label",
          "decision_note",
          "approved_organization_slug",
          "approved_workspace_slug"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "description": "Internal API routing reference. Never display internal UUIDs in product UI."
          },
          "email": {
            "type": "string"
          },
          "applicant_name": {
            "type": "string"
          },
          "organization_name": {
            "type": "string"
          },
          "workspace_name": {
            "type": "string"
          },
          "note": {
            "type": [
              "string",
              "null"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "pending",
              "approved",
              "rejected"
            ]
          },
          "revision": {
            "type": "string",
            "pattern": "^[1-9][0-9]*$"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "reviewed_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "reviewed_by_kind": {
            "type": [
              "string",
              "null"
            ],
            "enum": [
              "installation",
              "operator",
              null
            ]
          },
          "reviewed_by_label": {
            "type": [
              "string",
              "null"
            ]
          },
          "decision_note": {
            "type": [
              "string",
              "null"
            ]
          },
          "approved_organization_slug": {
            "type": [
              "string",
              "null"
            ]
          },
          "approved_workspace_slug": {
            "type": [
              "string",
              "null"
            ]
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
    },
    "counts": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "pending",
        "approved",
        "rejected"
      ],
      "properties": {
        "pending": {
          "type": "integer",
          "minimum": 0
        },
        "approved": {
          "type": "integer",
          "minimum": 0
        },
        "rejected": {
          "type": "integer",
          "minimum": 0
        }
      }
    },
    "policy": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "mode",
        "revision",
        "updated_at"
      ],
      "properties": {
        "mode": {
          "type": "string",
          "enum": [
            "disabled",
            "approval_required"
          ]
        },
        "revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        },
        "updated_at": {
          "type": "string"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid status filter, cursor, or limit.

### HTTP 401

Authentication required.

### HTTP 403

Platform administration required.

## Behavior and supported scope

Platform administration required. Returns submitted registration requests, counts by status, and the current policy. Password hashes are never returned.

**Supported scope:** implemented
