---
title: "Approve a Limited Preview registration"
description: "POST /api/v1/admin/registrations/{registration}/approve"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

`POST /api/v1/admin/registrations/{registration}/approve`

Platform administration required. Atomically creates the customer organization (and balance account in configured platform currency when present), initial workspace with human-readable slug, organization-wide owner operator, and password credentials from the applicant's submitted Argon2id hash.

Operation: `approvePlatformRegistration`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/admin/registrations/{registration}/approve" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### registration

Location: **path**. **Required.**

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
    "expected_revision"
  ],
  "properties": {
    "expected_revision": {
      "type": "string",
      "pattern": "^[1-9][0-9]*$"
    },
    "organization_name": {
      "type": "string",
      "maxLength": 120
    },
    "workspace_name": {
      "type": "string",
      "maxLength": 120
    },
    "note": {
      "type": "string",
      "maxLength": 500
    }
  }
}
```

## Responses

### HTTP 200

Registration approved and workspace owner provisioned.

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
  }
}
```

### HTTP 400

Invalid approval payload or name override.

### HTTP 401

Authentication required.

### HTTP 403

Platform administration required.

### HTTP 409

Request already reviewed, stale revision, or email already bound to an active account.

## Behavior and supported scope

Platform administration required. Atomically creates the customer organization (and balance account in configured platform currency when present), initial workspace with human-readable slug, organization-wide owner operator, and password credentials from the applicant's submitted Argon2id hash.

**Supported scope:** implemented
