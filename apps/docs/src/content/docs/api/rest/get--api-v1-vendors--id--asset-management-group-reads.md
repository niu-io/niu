---
title: "List scoped ordinary group-read outcomes and timing"
description: "GET /api/v1/vendors/{id}/asset-management/group-reads"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/vendors/{id}/asset-management/group-reads`

Platform administrator only. Audit metadata without descriptive content or upstream identities. Newest claim first, stable chronological cursor pagination. Unresolved means no durable outcome, not proof that work is still running. Duration is measured gateway execution time; no Provider queue or processing intervals are inferred. Audit remains after result deletion or grant revocation. No upstream request or automatic retry occurs. Responses use Cache-Control no-store.

Operation: `get--api-v1-vendors--id--asset-management-group-reads`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/vendors/{id}/asset-management/group-reads" \
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

Location: **query**. Optional. Previous page next_cursor; missing or out-of-scope cursors produce an empty page.

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

Bounded outcome history.

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
      "items": {
        "type": "object",
        "required": [
          "read_id",
          "status",
          "started_at",
          "completed_at",
          "duration_ms",
          "reason"
        ],
        "properties": {
          "read_id": {
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
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid limit.

### HTTP 401

Authentication required.

### HTTP 403

Platform administrator required.

## Behavior and supported scope

Platform administrator only. Audit metadata without descriptive content or upstream identities. Newest claim first, stable chronological cursor pagination. Unresolved means no durable outcome, not proof that work is still running. Duration is measured gateway execution time; no Provider queue or processing intervals are inferred. Audit remains after result deletion or grant revocation. No upstream request or automatic retry occurs. Responses use Cache-Control no-store.
