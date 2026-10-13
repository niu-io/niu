---
title: "Create upstream human verification session"
description: "POST /v1/media/verification-sessions"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/media/verification-sessions`

Current workspace API key, model grant, composed workspace/key model and Provider policy, eligible published route and selectable credential required. Original immutable account/model binding is revalidated; original key identity binds encryption only, not workspace access control. Only configured fastrouter-actions-v1 channels are supported. Forwards only caller-supplied optional subject_name and return_url to the upstream H5 service. Exactly one creation follows a durable claim. All after-send failures remain unknown without automatic retry. A created session is not human completion or a local liveness approval. Token and H5 URL are encrypted and absent from ordinary metadata and logs.

Operation: `createMediaVerificationSession`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/media/verification-sessions" \
  -H "Authorization: Bearer $NIU_API_KEY" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### Idempotency-Key

Location: **header**. Optional. Canonical nonnil UUID; unchanged replay reads saved session without repeating creation.

```json
{
  "type": "string",
  "format": "uuid"
}
```

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "model"
  ],
  "properties": {
    "model": {
      "type": "string"
    },
    "subject_name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 32
    },
    "return_url": {
      "type": "string",
      "format": "uri",
      "maxLength": 8192
    }
  }
}
```

## Responses

### HTTP 202

Saved session accepted

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

Current workspace API key, model grant, composed workspace/key model and Provider policy, eligible published route and selectable credential required. Original immutable account/model binding is revalidated; original key identity binds encryption only, not workspace access control. Only configured fastrouter-actions-v1 channels are supported. Forwards only caller-supplied optional subject_name and return_url to the upstream H5 service. Exactly one creation follows a durable claim. All after-send failures remain unknown without automatic retry. A created session is not human completion or a local liveness approval. Token and H5 URL are encrypted and absent from ordinary metadata and logs.

**Supported scope:** implemented
