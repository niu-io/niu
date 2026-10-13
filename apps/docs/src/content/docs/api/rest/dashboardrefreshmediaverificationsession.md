---
title: "Refresh upstream verification session"
description: "POST /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/media/verification-sessions/{id}/refresh"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/media/verification-sessions/{id}/refresh`

Session-authenticated workspace bridge. GET requires Read; mutations require Write. The selected workspace key, model grants, exact account/channel binding and member authorization are independently enforced; credentials remain server-side. Current workspace API key, model grant, composed workspace/key model and Provider policy, eligible published route and selectable credential required. Original immutable account/model binding is revalidated; original key identity binds encryption only, not workspace access control. Only configured fastrouter-actions-v1 channels are supported. Empty body only. One explicit bounded query for an active genuine saved token. Upstream resolution can create a group, so a durable query claim prevents concurrent or uncertain replay. In-flight or after-send uncertain queries are exposed as unknown. Genuine waiting/processing results permit a later explicit query. Other states return unchanged without an upstream call. Only actual decoded verified GroupId binds a person group; no fake completion or local detector.

Operation: `dashboardrefreshMediaVerificationSession`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/media/verification-sessions/{id}/refresh" \
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

Session-authenticated workspace bridge. GET requires Read; mutations require Write. The selected workspace key, model grants, exact account/channel binding and member authorization are independently enforced; credentials remain server-side. Current workspace API key, model grant, composed workspace/key model and Provider policy, eligible published route and selectable credential required. Original immutable account/model binding is revalidated; original key identity binds encryption only, not workspace access control. Only configured fastrouter-actions-v1 channels are supported. Empty body only. One explicit bounded query for an active genuine saved token. Upstream resolution can create a group, so a durable query claim prevents concurrent or uncertain replay. In-flight or after-send uncertain queries are exposed as unknown. Genuine waiting/processing results permit a later explicit query. Other states return unchanged without an upstream call. Only actual decoded verified GroupId binds a person group; no fake completion or local detector.

**Supported scope:** implemented
