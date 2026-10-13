---
title: "Read a saved Provider mutation operation"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/media/asset-operations/{id}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/media/asset-operations/{id}`

Session-authenticated workspace bridge. GET requires Read; mutations require Write. The selected workspace key, model grants, exact account/channel binding and member authorization are independently enforced; credentials remain server-side. Requires current selected workspace key authority, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Supplier or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Reads locally saved metadata only; unknown operation states require explicit reconciliation.

Operation: `dashboardget_operationProviderAsset`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/media/asset-operations/{id}" \
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

### key

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### id

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### model

Location: **query**. **Required.**

```json
{
  "type": "string"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Owned metadata

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
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
  }
}
```

### HTTP 400

Malformed or unsupported request fields

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

Session-authenticated workspace bridge. GET requires Read; mutations require Write. The selected workspace key, model grants, exact account/channel binding and member authorization are independently enforced; credentials remain server-side. Requires current selected workspace key authority, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Supplier or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Reads locally saved metadata only; unknown operation states require explicit reconciliation.

**Supported scope:** implemented
