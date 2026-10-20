---
title: "Retrieve scoped metadata-update audit history"
description: "GET /api/v1/vendors/{id}/asset-management/group-updates"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/vendors/{id}/asset-management/group-updates`

Platform administrator only. No patch metadata, upstream identities, credentials or commercial amounts. Newest prepared identity first with stable cursor pagination. Audit survives erasure and revocation. Unresolved is missing completion evidence, not proof of active work. Responses are no-store.

Operation: `get--api-v1-vendors--id--asset-management-group-updates`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/vendors/{id}/asset-management/group-updates" \
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

Safe history and next_cursor; out-of-scope cursors return an empty page.

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
          "update_id",
          "intent_id",
          "status",
          "created_at",
          "completed_at",
          "duration_ms",
          "reason",
          "patch_status",
          "reconciliation_required"
        ],
        "properties": {
          "update_id": {
            "type": "string",
            "format": "uuid"
          },
          "intent_id": {
            "type": "string",
            "format": "uuid"
          },
          "status": {
            "type": "string",
            "enum": [
              "prepared",
              "unresolved",
              "acknowledged",
              "uncertain",
              "reconciled"
            ]
          },
          "created_at": {
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
            ]
          },
          "patch_status": {
            "type": "string",
            "enum": [
              "retained",
              "erased",
              "expired"
            ]
          },
          "reconciliation_required": {
            "type": "boolean"
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

Platform administrator only. No patch metadata, upstream identities, credentials or commercial amounts. Newest prepared identity first with stable cursor pagination. Audit survives erasure and revocation. Unresolved is missing completion evidence, not proof of active work. Responses are no-store.
