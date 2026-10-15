---
title: "Revoke locally saved asset-management credentials"
description: "DELETE /api/v1/vendors/{id}/asset-management"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /api/v1/vendors/{id}/asset-management`

Installation administrator only. The expected management revision must match the latest configuration. Revocation blocks internal reads through that revision. Optional erasure removes ciphertext from the active database only and requires confirm_erase=true; immutable metadata and audit events remain. Exact repeat requests do not duplicate audit events. This does not revoke Access Keys at Ark or erase backups, and does not affect inference bearer credentials.

Operation: `revokeAssetManagement`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X DELETE "$NIU_ORIGIN/api/v1/vendors/{id}/asset-management" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "expected_revision"
  ],
  "properties": {
    "expected_revision": {
      "type": "integer",
      "minimum": 1
    },
    "erase_history": {
      "type": "boolean",
      "default": false
    },
    "confirm_erase": {
      "type": "boolean",
      "default": false
    }
  }
}
```

## Responses

### HTTP 200

Local revocation applied. erased_revisions counts ciphertext rows erased by this call, and is zero on a repeat.

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
        "revision",
        "configured",
        "dispatch_available",
        "erased_revisions"
      ],
      "properties": {
        "revision": {
          "type": "integer",
          "minimum": 1
        },
        "configured": {
          "type": "boolean",
          "const": false
        },
        "dispatch_available": {
          "type": "boolean",
          "const": false
        },
        "erased_revisions": {
          "type": "integer",
          "minimum": 0
        }
      }
    }
  }
}
```

### HTTP 400

Invalid input or missing erasure confirmation.

### HTTP 403

Installation administrator required.

### HTTP 409

Missing configuration or stale revision.

### HTTP 413

Request body exceeds 16 KiB.

## Behavior and supported scope

Installation administrator only. The expected management revision must match the latest configuration. Revocation blocks internal reads through that revision. Optional erasure removes ciphertext from the active database only and requires confirm_erase=true; immutable metadata and audit events remain. Exact repeat requests do not duplicate audit events. This does not revoke Access Keys at Ark or erase backups, and does not affect inference bearer credentials.
