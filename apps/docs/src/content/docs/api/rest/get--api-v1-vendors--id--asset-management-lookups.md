---
title: "List durable asset lookup audit history"
description: "GET /api/v1/vendors/{id}/asset-management/lookups"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/vendors/{id}/asset-management/lookups`

Platform administrator only. Safe operational metadata survives grant revocation and source erasure. Missing completion remains unresolved. No asset content, upstream identities, credentials or commercial amounts. Scoped cursor and newest-first ordering; no upstream call.

Operation: `get--api-v1-vendors--id--asset-management-lookups`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/vendors/{id}/asset-management/lookups" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  --url-query 'organization_id=<ORGANIZATION_ID>' \
  --url-query 'project_id=<PROJECT_ID>'
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
  "default": 30
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Operational history; Cache-Control no-store.

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
          "lookup_id",
          "listing_id",
          "status",
          "asset_status",
          "started_at",
          "completed_at",
          "duration_ms",
          "reason"
        ],
        "properties": {
          "lookup_id": {
            "type": "string",
            "format": "uuid"
          },
          "listing_id": {
            "type": "string",
            "format": "uuid"
          },
          "status": {
            "type": "string",
            "enum": [
              "unresolved",
              "succeeded",
              "failed"
            ]
          },
          "asset_status": {
            "type": [
              "string",
              "null"
            ],
            "enum": [
              "Active",
              "Processing",
              "Failed",
              null
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
              "invalid_configuration",
              "destination_rejected",
              "unavailable",
              "transport",
              "timeout",
              "response_limit",
              "invalid_response",
              null
            ]
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

Platform administrator only. Safe operational metadata survives grant revocation and source erasure. Missing completion remains unresolved. No asset content, upstream identities, credentials or commercial amounts. Scoped cursor and newest-first ordering; no upstream call.
