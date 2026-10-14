---
title: "List saved Provider mutation operations"
description: "GET /v1/media/asset-operations"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/media/asset-operations`

Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Reads locally saved metadata only; unknown operation states require explicit reconciliation. This read never calls the Provider or retries a mutation. Records are workspace-shared under current selected-key authority and exact model/account binding. Unknown remains uncertain; prepared is a persisted state, not permission to retry. A missing record is not proof that the original request was never sent. Newest-first immutable creation time and UUID tie-breaker ordering. Resource deletion does not remove operation history. limit defaults to 50.

Operation: `list_operationsProviderAsset`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/media/asset-operations" \
  -H "Authorization: Bearer $NIU_API_KEY"
```

## Parameters

### model

Location: **query**. **Required.**

```json
{
  "type": "string"
}
```

### after

Location: **query**. Optional. Cursor from this exact authorized model/account; invalid or mismatched cursor is rejected.

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

Bounded saved operation page

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

Invalid model, UUID, limit or cursor

### HTTP 401

Missing, expired or revoked API key

### HTTP 403

Workspace or key policy refuses access

### HTTP 404

Owned object or model unavailable

### HTTP 409

Changed input, stale revision, unresolved identity or route conflict

### HTTP 413

Request exceeds its bounded size

### HTTP 501

Selected channel does not support asset management

### HTTP 502

Provider read failed safely

### HTTP 503

Credential, capacity or bounded storage unavailable

## Behavior and supported scope

Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Reads locally saved metadata only; unknown operation states require explicit reconciliation. This read never calls the Provider or retries a mutation. Records are workspace-shared under current selected-key authority and exact model/account binding. Unknown remains uncertain; prepared is a persisted state, not permission to retry. A missing record is not proof that the original request was never sent. Newest-first immutable creation time and UUID tie-breaker ordering. Resource deletion does not remove operation history. limit defaults to 50.

**Supported scope:** implemented
