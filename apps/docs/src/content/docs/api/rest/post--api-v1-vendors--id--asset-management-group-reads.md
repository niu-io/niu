---
title: "Read a saved ordinary asset group using its original account"
description: "POST /api/v1/vendors/{id}/asset-management/group-reads"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/vendors/{id}/asset-management/group-reads`

Platform administrator only. Requires a successful saved group and a separate current GetAssetGroup grant bound to its original workspace, account and credential revisions. Commits a one-shot read claim before dispatch. Four reads may execute concurrently, with a 30-second transport deadline and 35-second outer deadline. Caller disconnection does not cancel claimed work or its durable outcome audit. Reusing a read_id conflicts and never resends. This does not establish asset readiness or change billing. Descriptive results are returned only after outcome persistence and a fresh platform-access and operation-qualification check; successful descriptive results are encrypted for 24 hours and can be recovered through the scoped GET endpoint until expiry, deletion or access revocation. No upstream identities or signed URLs are returned.

Operation: `post--api-v1-vendors--id--asset-management-group-reads`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/vendors/{id}/asset-management/group-reads" \
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
    "intent_id",
    "read_id"
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
    "intent_id": {
      "type": "string",
      "format": "uuid",
      "description": "Saved successful group creation identifier."
    },
    "read_id": {
      "type": "string",
      "format": "uuid",
      "description": "Fresh one-shot read identifier."
    }
  }
}
```

## Responses

### HTTP 200

Validated descriptive result; Cache-Control is no-store.

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
        "read_id",
        "name",
        "description",
        "created_at",
        "updated_at"
      ],
      "properties": {
        "read_id": {
          "type": "string",
          "format": "uuid"
        },
        "name": {
          "type": "string"
        },
        "description": {
          "type": [
            "string",
            "null"
          ]
        },
        "created_at": {
          "type": "string",
          "format": "date-time"
        },
        "updated_at": {
          "type": "string",
          "format": "date-time"
        }
      }
    }
  }
}
```

### HTTP 401

Authentication required.

### HTTP 403

Platform administrator required.

### HTTP 404

Saved group absent from the specified workspace or account.

### HTTP 409

Read already claimed or original operation qualification unavailable.

### HTTP 503

Read capacity, credentials, transport or outcome persistence unavailable; no automatic retry.

## Behavior and supported scope

Platform administrator only. Requires a successful saved group and a separate current GetAssetGroup grant bound to its original workspace, account and credential revisions. Commits a one-shot read claim before dispatch. Four reads may execute concurrently, with a 30-second transport deadline and 35-second outer deadline. Caller disconnection does not cancel claimed work or its durable outcome audit. Reusing a read_id conflicts and never resends. This does not establish asset readiness or change billing. Descriptive results are returned only after outcome persistence and a fresh platform-access and operation-qualification check; successful descriptive results are encrypted for 24 hours and can be recovered through the scoped GET endpoint until expiry, deletion or access revocation. No upstream identities or signed URLs are returned.
