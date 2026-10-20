---
title: "List historical native material operations"
description: "GET /api/v1/organizations/{organization}/projects/{project}/media/operations"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/media/operations`

Current authenticated workspace Read permission required. Native operation history is workspace-shared. Reads only immutable saved scope, original key, model and optional group/account context; does not authenticate or reenable an expired or revoked inference key, consult current model grants or catalog, select a default account, create a Provider client, call the Provider or retry a mutation. Safe Niu references and saved diagnostic metadata only; private Provider identifiers, source URLs, credentials and procurement prices are excluded. Prepared is not dispatch permission; unknown remains uncertain. A missing record does not prove an original request was never sent. Deleted resources retain operation history. Without context_group_id, includes all saved account bindings for this original key and model, without claiming they share an account. Newest-first creation time and UUID tie-breaker with exclusive cursor pagination. Validation and page share one bounded database snapshot; keep all filters fixed. This is a live history, not a fixed export snapshot.

Operation: `listHistoricalWorkspaceProviderAssetOperations`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/media/operations" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
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

### key_id

Location: **query**. **Required.** Original saved workspace key reference; expiration or revocation does not restore or remove historical read permission.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### model

Location: **query**. **Required.** Exact recorded Niu model alias. Never resolves a default Provider account.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 512
}
```

### context_group_id

Location: **query**. Optional. Existing scoped Niu group recorded under this original key/model; pins its immutable account, credential revision, model revision and upstream mapping without exposing those fields.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### after

Location: **query**. Optional. Cursor from these exact original-key/model/account filters. Unknown or foreign cursors are refused.

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

Saved workspace operation metadata

Response headers:

```json
{
  "Cache-Control": {
    "schema": {
      "type": "string"
    },
    "description": "no-store"
  }
}
```

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
          "group_id",
          "model",
          "action",
          "status",
          "created_at_ms",
          "updated_at_ms"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "group_id": {
            "type": "string",
            "format": "uuid"
          },
          "asset_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "model": {
            "type": "string"
          },
          "action": {
            "type": "string",
            "enum": [
              "create_group",
              "update_group",
              "delete_group",
              "create_asset",
              "rename_asset",
              "delete_asset"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "prepared",
              "unknown",
              "acknowledged",
              "not_sent"
            ]
          },
          "http_status": {
            "type": [
              "integer",
              "null"
            ]
          },
          "request_id": {
            "type": [
              "string",
              "null"
            ]
          },
          "diagnostic": {
            "description": "Sanitized observed failure category and phase. Null for older records or when no diagnostic was saved. Does not establish nonexecution or authorize replay.",
            "type": [
              "object",
              "null"
            ],
            "additionalProperties": false,
            "required": [
              "category",
              "phase"
            ],
            "properties": {
              "category": {
                "type": "string",
                "enum": [
                  "transport",
                  "timeout",
                  "response_too_large",
                  "invalid_response",
                  "upstream_rejected"
                ]
              },
              "phase": {
                "type": "string",
                "enum": [
                  "exchange",
                  "response",
                  "acknowledgement"
                ]
              }
            }
          },
          "created_at_ms": {
            "type": "integer",
            "format": "int64"
          },
          "updated_at_ms": {
            "type": "integer",
            "format": "int64"
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

Invalid query, UUID or limit

### HTTP 401

Invalid or expired member session

### HTTP 403

Current workspace Read denied

### HTTP 404

Operation absent from this exact binding

### HTTP 409

Foreign original key, account context or pagination cursor

### HTTP 503

Bounded storage unavailable

## Behavior and supported scope

Current authenticated workspace Read permission required. Native operation history is workspace-shared. Reads only immutable saved scope, original key, model and optional group/account context; does not authenticate or reenable an expired or revoked inference key, consult current model grants or catalog, select a default account, create a Provider client, call the Provider or retry a mutation. Safe Niu references and saved diagnostic metadata only; private Provider identifiers, source URLs, credentials and procurement prices are excluded. Prepared is not dispatch permission; unknown remains uncertain. A missing record does not prove an original request was never sent. Deleted resources retain operation history. Without context_group_id, includes all saved account bindings for this original key and model, without claiming they share an account. Newest-first creation time and UUID tie-breaker with exclusive cursor pagination. Validation and page share one bounded database snapshot; keep all filters fixed. This is a live history, not a fixed export snapshot.

**Supported scope:** implemented
