---
title: "Save an encrypted asset-management credential revision"
description: "PUT /api/v1/vendors/{id}/asset-management"
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/vendors/{id}/asset-management`

Installation administrator only. Direct Beijing Ark account required. Separate encryption binds the exact configuration, management revision and upstream project. Stale management or concurrently changed vendor revisions conflict. No upstream call, entitlement verification or dispatch activation occurs. Request body is limited to 16 KiB. Retention, revocation and lifecycle activation remain unqualified.

Operation: `configureAssetManagement`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/vendors/{id}/asset-management" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
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
    "expected_revision",
    "upstream_project",
    "access_key",
    "secret_key"
  ],
  "properties": {
    "expected_revision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9223372036854776000
    },
    "upstream_project": {
      "type": "string",
      "minLength": 1,
      "maxLength": 1024
    },
    "access_key": {
      "type": "string",
      "minLength": 1,
      "maxLength": 256,
      "writeOnly": true
    },
    "secret_key": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096,
      "writeOnly": true
    }
  }
}
```

## Responses

### HTTP 200

Saved configuration metadata only; no dispatch activation.

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
        "revision",
        "upstream_project",
        "configured",
        "dispatch_available"
      ],
      "properties": {
        "revision": {
          "type": "integer",
          "minimum": 1
        },
        "upstream_project": {
          "type": "string"
        },
        "configured": {
          "type": "boolean"
        },
        "dispatch_available": {
          "type": "boolean",
          "const": false
        }
      }
    }
  }
}
```

### HTTP 400

Invalid configuration or unavailable encryption.

### HTTP 403

Installation administrator required.

### HTTP 404

Credential configuration not found.

### HTTP 409

Stale management or changed vendor revision.

### HTTP 413

Request exceeds the configured body limit.

## Behavior and supported scope

Installation administrator only. Direct Beijing Ark account required. Separate encryption binds the exact configuration, management revision and upstream project. Stale management or concurrently changed vendor revisions conflict. No upstream call, entitlement verification or dispatch activation occurs. Request body is limited to 16 KiB. Retention, revocation and lifecycle activation remain unqualified.
