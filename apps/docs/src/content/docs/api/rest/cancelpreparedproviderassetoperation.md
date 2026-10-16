---
title: "Cancel an unclaimed native material preparation"
description: "POST /v1/media/asset-operations/{id}/cancel"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/media/asset-operations/{id}/cancel`

Current selected key, exact model/account/channel and workspace Write authority required. Safe Niu references only; no Provider identifiers, source URLs, credentials or procurement prices returned. Only prepared can transition to not_sent; a not_sent replay is unchanged. Unknown or acknowledged returns409 and cannot be canceled. No Provider call. This key-scoped endpoint requires current original-key authority; use the workspace historical cancellation endpoint after key expiry or revocation.

Operation: `cancelPreparedProviderAssetOperation`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/media/asset-operations/{id}/cancel" \
  -H "Authorization: Bearer $NIU_API_KEY"
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

Saved operation metadata

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
  }
}
```

### HTTP 400

Invalid input or missing idempotency UUID

### HTTP 401

Missing expired or revoked key/session

### HTTP 403

Workspace Write or key policy refused

### HTTP 404

Owned preparation or model unavailable

### HTTP 409

Changed canonical input, stale revision, route or operation state conflict

### HTTP 413

Request exceeds16KiB

### HTTP 501

Channel unsupported

### HTTP 503

Storage or configuration unavailable

## Behavior and supported scope

Current selected key, exact model/account/channel and workspace Write authority required. Safe Niu references only; no Provider identifiers, source URLs, credentials or procurement prices returned. Only prepared can transition to not_sent; a not_sent replay is unchanged. Unknown or acknowledged returns409 and cannot be canceled. No Provider call. This key-scoped endpoint requires current original-key authority; use the workspace historical cancellation endpoint after key expiry or revocation.

**Supported scope:** implemented
