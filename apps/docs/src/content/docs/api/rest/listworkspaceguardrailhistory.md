---
title: "Browse immutable workspace policy revision metadata"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/guardrails/history"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/guardrails/history`

Workspace read access required. Newest first, at most 100 records per page. Excludes policy content, internal actor identifiers and credentials. Active reflects the workspace head at the time of each page read. Cache-Control is no-store.

Operation: `listWorkspaceGuardrailHistory`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/guardrails/history" \
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

### before_revision

Location: **query**. Optional. Exclusive cursor returned as next_cursor.

```json
{
  "type": "integer",
  "minimum": 1
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Revision metadata, including rollback attribution. An empty workspace returns an empty array.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_cursor"
  ],
  "properties": {
    "next_cursor": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": 1
    },
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "revision",
          "policy_name",
          "active",
          "actor_name",
          "activated_at",
          "restored_from_revision"
        ],
        "properties": {
          "revision": {
            "type": "integer",
            "minimum": 1
          },
          "policy_name": {
            "type": "string"
          },
          "active": {
            "type": "boolean"
          },
          "actor_name": {
            "type": "string"
          },
          "activated_at": {
            "type": "string",
            "format": "date-time"
          },
          "restored_from_revision": {
            "type": [
              "integer",
              "null"
            ],
            "minimum": 1
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid history cursor. Errors do not echo submitted values.

### HTTP 401

Authentication required, including malformed query requests.

### HTTP 403

Workspace read access required.

## Behavior and supported scope

Workspace read access required. Newest first, at most 100 records per page. Excludes policy content, internal actor identifiers and credentials. Active reflects the workspace head at the time of each page read. Cache-Control is no-store.
