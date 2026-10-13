---
title: "List API key concurrency policy history"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/concurrency-limit/history"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/concurrency-limit/history`

Scoped readers receive descending revisions shared across rotations. Use the last revision as the next page cursor.

Operation: `listKeyConcurrencyLimitHistory`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/concurrency-limit/history" \
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

Immutable policy history; no internal actor identifiers.

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
          "max_concurrent_requests",
          "revision",
          "recorded_at",
          "actor_kind",
          "actor_name"
        ],
        "properties": {
          "max_concurrent_requests": {
            "type": [
              "integer",
              "null"
            ],
            "minimum": 0,
            "maximum": 10000,
            "description": "Maximum unresolved dispatched requests; null is unlimited and zero denies dispatch."
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

Invalid pagination

### HTTP 401

Authentication required

### HTTP 403

Workspace access denied

### HTTP 404

Workspace is outside operator scope, or key is absent from authorized workspace

## Behavior and supported scope

Scoped readers receive descending revisions shared across rotations. Use the last revision as the next page cursor.

**Supported scope:** implemented
