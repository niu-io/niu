---
title: "List scoped ordinary asset-listing outcomes and timing"
description: "GET /admin/v1/vendors/{id}/asset-management/listings"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/vendors/{id}/asset-management/listings`

Platform administrator only. Durable audit metadata survives page-content deletion and grant revocation. No upstream request, credential release or billing mutation. Unresolved means no durable outcome, not running work or replay permission. Durations measure gateway execution; no Provider queue/run intervals or complete inventory are inferred. Upstream identities, cursors, descriptive content and procurement data are excluded. Stable newest-first cursor pagination, Cache-Control no-store.

Operation: `get--admin-v1-vendors--id--asset-management-listings`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/vendors/{id}/asset-management/listings" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

### id

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### organization_id

Location: **query**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### project_id

Location: **query**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### after

Location: **query**. Optional. Previous next_cursor; unknown or out-of-scope cursors return an empty page.

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
  "default": 30
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Bounded operational audit history.

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
        "string",
        "null"
      ],
      "format": "uuid"
    },
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "listing_id",
          "previous_listing_id",
          "page_number",
          "status",
          "started_at",
          "completed_at",
          "duration_ms",
          "reason",
          "item_count",
          "has_more"
        ],
        "properties": {
          "listing_id": {
            "type": "string",
            "format": "uuid"
          },
          "previous_listing_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "page_number": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100
          },
          "status": {
            "type": "string",
            "enum": [
              "unresolved",
              "succeeded",
              "failed"
            ]
          },
          "started_at": {
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
          "duration_ms": {
            "type": [
              "integer",
              "null"
            ],
            "minimum": 0
          },
          "reason": {
            "type": [
              "string",
              "null"
            ],
            "enum": [
              null,
              "invalid_configuration",
              "destination_rejected",
              "unavailable",
              "transport",
              "timeout",
              "response_limit",
              "invalid_response"
            ]
          },
          "item_count": {
            "type": [
              "integer",
              "null"
            ],
            "minimum": 0,
            "maximum": 100
          },
          "has_more": {
            "type": [
              "boolean",
              "null"
            ],
            "description": "Observed next-page availability, not complete inventory or current permission to continue."
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid limit or query.

### HTTP 401

Authentication required.

### HTTP 403

Platform administrator required.

## Behavior and supported scope

Platform administrator only. Durable audit metadata survives page-content deletion and grant revocation. No upstream request, credential release or billing mutation. Unresolved means no durable outcome, not running work or replay permission. Durations measure gateway execution; no Provider queue/run intervals or complete inventory are inferred. Upstream identities, cursors, descriptive content and procurement data are excluded. Stable newest-first cursor pagination, Cache-Control no-store.
