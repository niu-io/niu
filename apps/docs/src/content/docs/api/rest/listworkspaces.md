---
title: "List an authorized page of workspaces"
description: "GET /api/v1/workspaces"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/workspaces`

Requires installation or member read authorization. Member company/workspace scope is enforced server-side. Stable company/workspace creation order; renaming does not move entries. Follow next_cursor as after with unchanged credentials until null. Pages reflect live state, not a snapshot; restart traversal if a cursor workspace is deleted. UUIDs are routing identifiers, not display labels.

Operation: `listWorkspaces`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/workspaces" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### after

Location: **query**. Optional. Last next_cursor from this authorized traversal.

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
  "maximum": 1000,
  "default": 1000
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Authorized workspace page, with null next_cursor at the current end.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_cursor"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "name",
          "route_slug",
          "organization_id",
          "organization_name",
          "is_default",
          "created_at_ms",
          "active_key_count",
          "requests_30d",
          "requests_by_day",
          "last_request_at_ms",
          "slug",
          "slug_aliases"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "name": {
            "type": "string"
          },
          "route_slug": {
            "type": "string",
            "maxLength": 81,
            "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
            "description": "Deprecated compatibility alias for slug.",
            "deprecated": true
          },
          "organization_id": {
            "type": "string",
            "format": "uuid"
          },
          "organization_name": {
            "type": "string"
          },
          "is_default": {
            "type": "boolean"
          },
          "created_at_ms": {
            "type": "integer",
            "format": "int64"
          },
          "active_key_count": {
            "type": "integer",
            "format": "int64",
            "minimum": 0
          },
          "requests_30d": {
            "type": "integer",
            "format": "int64",
            "minimum": 0,
            "description": "Request operations created in the last 30 days; retries count once."
          },
          "requests_by_day": {
            "type": "array",
            "description": "UTC daily counts for today and the preceding 29 days, including zero days.",
            "items": {
              "type": "object",
              "required": [
                "start_ms",
                "request_count"
              ],
              "properties": {
                "start_ms": {
                  "type": "integer",
                  "format": "int64"
                },
                "request_count": {
                  "type": "integer",
                  "format": "int64",
                  "minimum": 0
                }
              }
            }
          },
          "last_request_at_ms": {
            "type": [
              "integer",
              "null"
            ],
            "format": "int64"
          },
          "slug": {
            "type": "string",
            "maxLength": 81,
            "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
            "description": "Stable, readable workspace slug. Use in dashboard URLs; renaming preserves it."
          },
          "slug_aliases": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Previously issued slugs accepted for existing bookmarks."
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

Invalid page size, malformed cursor, or unknown query parameter.

### HTTP 401

Missing, invalid, expired or revoked management credential.

### HTTP 403

Credential lacks management read access.

### HTTP 409

Cursor is missing, deleted or outside the authorized scope. Restart traversal.

## Behavior and supported scope

Requires installation or member read authorization. Member company/workspace scope is enforced server-side. Stable company/workspace creation order; renaming does not move entries. Follow next_cursor as after with unchanged credentials until null. Pages reflect live state, not a snapshot; restart traversal if a cursor workspace is deleted. UUIDs are routing identifiers, not display labels.

**Supported scope:** implemented
