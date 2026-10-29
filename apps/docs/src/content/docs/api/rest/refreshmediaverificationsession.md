---
title: "Refresh upstream verification session"
description: "POST /v1/media/verifications/{id}/refresh"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/media/verifications/{id}/refresh`

Current workspace API key, model grant, composed workspace/key model and Provider policy, eligible published route and selectable credential required. Original immutable account/model binding is revalidated; original key identity binds encryption only, not workspace access control. Only configured fastrouter-actions-v1 channels are supported. Empty body only. One explicit bounded query for an active genuine saved token. Upstream resolution can create a group, so a durable query claim prevents concurrent or uncertain replay. In-flight or after-send uncertain queries are exposed as unknown. Genuine waiting/processing results permit a later explicit query. Other states return unchanged without an upstream call. Only actual decoded verified GroupId binds a person group; no fake completion or local detector.

Operation: `refreshMediaVerificationSession`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  },
  {
    "niuApiKeyAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

Authentication alternative: `bearerAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/media/verifications/{id}/refresh" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  --url-query 'model=<MODEL>'
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/media/verifications/{id}/refresh" \
  -H "X-Niu-API-Key: $NIU_API_KEY" \
  --url-query 'model=<MODEL>'
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

Owned verification metadata

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
      "additionalProperties": false,
      "required": [
        "id",
        "model",
        "subject_name",
        "status",
        "group_id",
        "expires_at",
        "created_at_ms",
        "updated_at_ms"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "model": {
          "type": "string"
        },
        "subject_name": {
          "type": [
            "string",
            "null"
          ]
        },
        "status": {
          "type": "string",
          "enum": [
            "prepared",
            "unknown",
            "not_sent",
            "waiting_user",
            "processing",
            "verified",
            "failed",
            "expired"
          ]
        },
        "group_id": {
          "type": [
            "string",
            "null"
          ],
          "format": "uuid"
        },
        "expires_at": {
          "type": [
            "string",
            "null"
          ],
          "format": "date-time"
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

Invalid fields or query

### HTTP 401

Missing, revoked or expired API key

### HTTP 403

Workspace/key policy refusal

### HTTP 404

Owned session or model not found

### HTTP 409

Changed input, stale route, expiry, unavailable token or capacity conflict

### HTTP 413

Body exceeds bounded size

### HTTP 501

Selected channel does not configure verification management

### HTTP 503

Credential, encrypted content or bounded storage unavailable

## Behavior and supported scope

Current workspace API key, model grant, composed workspace/key model and Provider policy, eligible published route and selectable credential required. Original immutable account/model binding is revalidated; original key identity binds encryption only, not workspace access control. Only configured fastrouter-actions-v1 channels are supported. Empty body only. One explicit bounded query for an active genuine saved token. Upstream resolution can create a group, so a durable query claim prevents concurrent or uncertain replay. In-flight or after-send uncertain queries are exposed as unknown. Genuine waiting/processing results permit a later explicit query. Other states return unchanged without an upstream call. Only actual decoded verified GroupId binds a person group; no fake completion or local detector.

**Supported scope:** implemented
