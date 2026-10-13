---
title: "Prepare an encrypted metadata patch for a saved ordinary group"
description: "POST /admin/v1/vendors/{id}/asset-management/group-updates"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/vendors/{id}/asset-management/group-updates`

Platform administrator only. Requires a successful saved group and current distinct UpdateAssetGroup qualification. Derives the original upstream identity from storage. Saves immutable update identity and digest with an encrypted 24-hour patch. Same update identity and patch is idempotent; changed patch conflicts. Does not dispatch, claim completion, release a hold or charge inference. Explicit empty description is retained; omit a field to leave it unchanged.

Operation: `post--admin-v1-vendors--id--asset-management-group-updates`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/vendors/{id}/asset-management/group-updates" \
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
    "update_id"
  ],
  "properties": {
    "organization_id": {
      "type": "string",
      "format": "uuid"
    },
    "project_id": {
      "type": "string",
      "format": "uuid"
    },
    "intent_id": {
      "type": "string",
      "format": "uuid"
    },
    "update_id": {
      "type": "string",
      "format": "uuid"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 64
    },
    "description": {
      "type": "string",
      "maxLength": 300
    }
  },
  "anyOf": [
    {
      "required": [
        "name"
      ]
    },
    {
      "required": [
        "description"
      ]
    }
  ]
}
```

## Responses

### HTTP 200

Identical preparation already exists; no overwrite or upstream dispatch.

### HTTP 201

Encrypted patch prepared; data contains update_id, prepared true and dispatch_available.

### HTTP 400

Invalid metadata or empty patch.

### HTTP 401

Authentication required.

### HTTP 403

Platform administrator required.

### HTTP 404

Saved original group is unavailable in this scope.

### HTTP 409

Qualification unavailable or changed patch conflicts.

### HTTP 422

Malformed request.

### HTTP 503

Encryption unavailable.

## Behavior and supported scope

Platform administrator only. Requires a successful saved group and current distinct UpdateAssetGroup qualification. Derives the original upstream identity from storage. Saves immutable update identity and digest with an encrypted 24-hour patch. Same update identity and patch is idempotent; changed patch conflicts. Does not dispatch, claim completion, release a hold or charge inference. Explicit empty description is retained; omit a field to leave it unchanged.
