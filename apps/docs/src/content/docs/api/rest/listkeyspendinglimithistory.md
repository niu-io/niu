---
title: "List API key spending history"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit/{currency}/history"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit/{currency}/history`

Descending immutable revision history shared across rotations. Use the last returned revision as before_revision for the next page. Returns currency, nullable limit_nanos, revision, recorded_at, actor_kind and actor_name; never an internal actor identifier.

Operation: `listKeySpendingLimitHistory`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit/{currency}/history" \
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

### key

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

Data array of policy revisions

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
          "currency",
          "limit_nanos",
          "revision",
          "recorded_at",
          "actor_kind",
          "actor_name"
        ],
        "properties": {
          "currency": {
            "type": "string",
            "pattern": "^[A-Z]{3}$"
          },
          "limit_nanos": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$"
          },
          "revision": {
            "type": "string",
            "pattern": "^[1-9][0-9]*$"
          },
          "recorded_at": {
            "type": "string",
            "format": "date-time"
          },
          "actor_kind": {
            "type": "string",
            "enum": [
              "installation",
              "member"
            ]
          },
          "actor_name": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid currency or pagination

### HTTP 401

Authentication required

### HTTP 403

Workspace access denied

### HTTP 404

Key does not exist in the authorized workspace

## Behavior and supported scope

Descending immutable revision history shared across rotations. Use the last returned revision as before_revision for the next page. Returns currency, nullable limit_nanos, revision, recorded_at, actor_kind and actor_name; never an internal actor identifier.

**Supported scope:** implemented
