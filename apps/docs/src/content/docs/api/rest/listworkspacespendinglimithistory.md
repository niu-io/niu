---
title: "List workspace spending revisions"
description: "GET /api/v1/organizations/{organization}/projects/{project}/spending-limit/{currency}/history"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/spending-limit/{currency}/history`

Workspace read permission required. Descending immutable history. before_revision is exclusive. next_before_revision is a decimal string or null; an exactly full final page can yield an empty following page. Baseline timestamps and actor data may be null.

Operation: `listWorkspaceSpendingLimitHistory`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/spending-limit/{currency}/history" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
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

### currency

Location: **path**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
}
```

### before_revision

Location: **query**. Optional.

```json
{
  "type": "integer",
  "format": "int64",
  "minimum": 1
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

Current scoped state

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_before_revision"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "currency",
          "revision",
          "limit_nanos",
          "recorded_at",
          "source",
          "actor_kind",
          "actor_name"
        ],
        "properties": {
          "currency": {
            "type": "string"
          },
          "revision": {
            "type": "string",
            "pattern": "^[0-9]+$",
            "description": "Exact nonnegative decimal integer, within signed 64-bit range."
          },
          "limit_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$",
            "description": "Exact nonnegative decimal integer, within signed 64-bit range."
          },
          "recorded_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "source": {
            "type": "string"
          },
          "actor_kind": {
            "type": [
              "string",
              "null"
            ]
          },
          "actor_name": {
            "type": [
              "string",
              "null"
            ]
          }
        }
      }
    },
    "next_before_revision": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$",
      "description": "Exact nonnegative decimal integer, within signed 64-bit range."
    }
  }
}
```

### HTTP 400

Invalid currency, decimal value or history query

### HTTP 401

Authentication required

### HTTP 403

Insufficient role permissions

### HTTP 404

Workspace unavailable in the authorized scope

## Behavior and supported scope

Workspace read permission required. Descending immutable history. before_revision is exclusive. next_before_revision is a decimal string or null; an exactly full final page can yield an empty following page. Baseline timestamps and actor data may be null.

**Supported scope:** implemented
