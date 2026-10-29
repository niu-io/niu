---
title: "Create an ordinary asset group through platform administration"
description: "POST /api/v1/vendors/{id}/asset-management/groups"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/vendors/{id}/asset-management/groups`

Platform administrator only. Persists the ordinary AIGC request and requires exact, unexpired workspace/account qualification before releasing credentials. Uses the fixed direct Beijing Ark CreateAssetGroup operation once, with a fresh UTC signature and a 30-second transport deadline. Four sends may run concurrently. Accepted work continues independently of the HTTP response and participates in graceful drain. Exact saved dispatching, uncertain and succeeded requests return status without acquiring dispatch capacity or decrypting keys, including after credential erasure. They never replay automatically; inspect the workspace asset-group request instead. Customer asset routing, CRUD/readiness, live entitlement and free-operation qualification remain pending. The legacy dispatch_available metadata flag describes the complete customer asset workflow and remains false. Request body is limited to 16 KiB.

Operation: `createOrdinaryAssetGroup`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/vendors/{id}/asset-management/groups" \
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
    "organization_id",
    "project_id",
    "idempotency_key",
    "vendor_revision",
    "credential_revision",
    "name"
  ],
  "properties": {
    "organization_id": {
      "type": "string",
      "format": "uuid"
    },
    "project_id": {
      "type": "string",
      "format": "uuid",
      "description": "Workspace routing identifier."
    },
    "idempotency_key": {
      "type": "string",
      "format": "uuid"
    },
    "vendor_revision": {
      "type": "integer",
      "minimum": 1
    },
    "credential_revision": {
      "type": "integer",
      "minimum": 1
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 64,
      "description": "Nonblank ordinary group name; control characters are rejected."
    },
    "description": {
      "type": [
        "string",
        "null"
      ],
      "maxLength": 300,
      "description": "Newline/tab/carriage return allowed; other control characters rejected."
    }
  }
}
```

## Responses

### HTTP 202

One-shot work accepted, or saved status for an identical previously claimed request. This is not proof the upstream group exists.

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
        "status"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid",
          "description": "Saved request routing identifier; never a display label."
        },
        "status": {
          "type": "string",
          "enum": [
            "dispatching",
            "uncertain",
            "succeeded"
          ]
        }
      }
    }
  }
}
```

### HTTP 400

Invalid ordinary name, description or revisions.

### HTTP 401

Authentication required.

### HTTP 403

Platform administrator required.

### HTTP 404

Workspace does not belong to the specified organization.

### HTTP 409

Missing or changed qualification/credentials/account, conflicting idempotency binding, or a concurrent claim. No automatic replay is permitted.

### HTTP 413

Request body exceeds 16 KiB.

### HTTP 422

Invalid shape or unknown fields.

### HTTP 503

Asset management capacity or encrypted credentials unavailable. No send was admitted by this request.

## Behavior and supported scope

Platform administrator only. Persists the ordinary AIGC request and requires exact, unexpired workspace/account qualification before releasing credentials. Uses the fixed direct Beijing Ark CreateAssetGroup operation once, with a fresh UTC signature and a 30-second transport deadline. Four sends may run concurrently. Accepted work continues independently of the HTTP response and participates in graceful drain. Exact saved dispatching, uncertain and succeeded requests return status without acquiring dispatch capacity or decrypting keys, including after credential erasure. They never replay automatically; inspect the workspace asset-group request instead. Customer asset routing, CRUD/readiness, live entitlement and free-operation qualification remain pending. The legacy dispatch_available metadata flag describes the complete customer asset workflow and remains false. Request body is limited to 16 KiB.
