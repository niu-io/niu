---
title: "Inspect requests contributing unresolved key capacity"
description: "GET /api/v1/organizations/{organization}/projects/{project}/keys/{key}/capacity"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/keys/{key}/capacity`

Workspace read authority required. Includes the full secret-rotation lineage. Concurrency uses unresolved dispatched requests. Tokens uses reservations and unbounded usage from unresolved dispatches plus completed unknown-usage requests in the rolling 60-second window, matching the token-budget calculation; known recent usage is not returned here. Each page has a fresh statement snapshot. UUID keyset cursor is internal; rows may resolve between pages. Refresh to restart investigation. This read does not contact Providers, reconcile usage, release reservations or retry requests. No credentials, prompt content or procurement data. Cache-Control no-store.

Operation: `listKeyCapacityRequests`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/keys/{key}/capacity" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
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

### kind

Location: **query**. Optional.

```json
{
  "type": "string",
  "enum": [
    "concurrency",
    "tokens"
  ],
  "default": "concurrency"
}
```

### after

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

Matching current contributors and snapshot count

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data",
    "total",
    "snapshot_at",
    "next_after"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "attempt_id",
          "model_alias",
          "key_name",
          "created_at",
          "dispatched_at",
          "completed_at",
          "execution",
          "reserved_tokens"
        ],
        "properties": {
          "attempt_id": {
            "type": "string",
            "format": "uuid"
          },
          "model_alias": {
            "type": "string"
          },
          "key_name": {
            "type": "string"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "dispatched_at": {
            "type": "string",
            "format": "date-time"
          },
          "completed_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "execution": {
            "type": "string",
            "enum": [
              "may_have_executed",
              "confirmed_completed"
            ]
          },
          "reserved_tokens": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$"
          }
        }
      }
    },
    "total": {
      "type": "integer",
      "minimum": 0
    },
    "snapshot_at": {
      "type": "string",
      "format": "date-time"
    },
    "next_after": {
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

Invalid query

### HTTP 401

Authentication required

### HTTP 403

Insufficient management permission

### HTTP 404

Key or workspace outside the authorized scope

### HTTP 409

Cursor unavailable; restart pagination

## Behavior and supported scope

Workspace read authority required. Includes the full secret-rotation lineage. Concurrency uses unresolved dispatched requests. Tokens uses reservations and unbounded usage from unresolved dispatches plus completed unknown-usage requests in the rolling 60-second window, matching the token-budget calculation; known recent usage is not returned here. Each page has a fresh statement snapshot. UUID keyset cursor is internal; rows may resolve between pages. Refresh to restart investigation. This read does not contact Providers, reconcile usage, release reservations or retry requests. No credentials, prompt content or procurement data. Cache-Control no-store.

**Supported scope:** implemented
