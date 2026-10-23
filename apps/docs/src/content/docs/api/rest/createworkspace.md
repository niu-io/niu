---
title: "Create a workspace with retry-safe identity"
description: "POST /api/v1/workspaces"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/workspaces`

Requires installation write access or a company-scoped member allowed to create workspaces, platform currency setup, and either payment readiness or a funded/granted/approved-credit arrangement for the selected company. Optional Idempotency-Key is durable and actor-scoped: identical input returns the original identity and current metadata with 201; changed input returns 409; replay after deletion returns 404 without recreation. Installation credentials share one namespace; members use their stable member identity. Without the header, each successful call creates a workspace. Current member/session authorization is rechecked after lock waits. If an installation caller omits organization_id, company, zero-funded USD account, zero approved credit, workspace and receipt commit together. No payment or funded balance is created.

Operation: `createWorkspace`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/workspaces" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### Idempotency-Key

Location: **header**. Optional. One header containing visible ASCII characters. Retain the same value and input when recovering an uncertain response.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 128,
  "pattern": "^[!-~]+$"
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
    "name"
  ],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200,
      "description": "Must contain non-whitespace text; at most 200 UTF-8 bytes before trimming. The saved name is trimmed."
    },
    "organization_id": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid",
      "description": "Company scope. Members default to their current company. Installation callers may omit it to create a Personal workspace company."
    },
    "spending_limit": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "currency",
        "limit_nanos"
      ],
      "properties": {
        "currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$"
        },
        "limit_nanos": {
          "type": "string",
          "pattern": "^[0-9]+$",
          "description": "Nonnegative nanounits, at most 9223372036854775807."
        }
      },
      "description": "Optional lifetime retail cap in an existing company account currency. Requires an owner or installation administrator. Saved atomically with the workspace; omitted means no limit."
    },
    "slug": {
      "type": "string",
      "minLength": 1,
      "maxLength": 48,
      "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
      "description": "Optional unique slug. When omitted, generated from the name using pinyin for Chinese, normalized separators, and a numeric suffix on collisions. The value default is reserved."
    }
  }
}
```

## Responses

### HTTP 201

Created or replayed workspace with its current metadata.

Content type: `application/json`.

```json
{
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
```

### HTTP 400

Invalid name, malformed JSON syntax, or invalid/repeated Idempotency-Key header.

### HTTP 401

Missing, expired or revoked credentials, including member/session authorization lost while waiting for a lock.

### HTTP 403

Credential does not have write access.

### HTTP 404

Company scope is not permitted, or the workspace from the original idempotent creation has been deleted.

### HTTP 409

The requested slug is already in use, or Idempotency-Key belongs to different creation input.

### HTTP 422

JSON body has an unknown field, invalid field type or UUID, or is missing a required field.

### HTTP 503

Storage unavailable; the outcome may be uncertain. Retry with the same idempotency identity and input.

## Behavior and supported scope

Requires installation write access or a company-scoped member allowed to create workspaces, platform currency setup, and either payment readiness or a funded/granted/approved-credit arrangement for the selected company. Optional Idempotency-Key is durable and actor-scoped: identical input returns the original identity and current metadata with 201; changed input returns 409; replay after deletion returns 404 without recreation. Installation credentials share one namespace; members use their stable member identity. Without the header, each successful call creates a workspace. Current member/session authorization is rechecked after lock waits. If an installation caller omits organization_id, company, zero-funded USD account, zero approved credit, workspace and receipt commit together. No payment or funded balance is created.

**Supported scope:** implemented
