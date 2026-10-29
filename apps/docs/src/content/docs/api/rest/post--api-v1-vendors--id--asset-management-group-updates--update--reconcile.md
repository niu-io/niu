---
title: "Read back and reconcile an acknowledged ordinary-group update"
description: "POST /api/v1/vendors/{id}/asset-management/group-updates/{update}/reconcile"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/vendors/{id}/asset-management/group-updates/{update}/reconcile`

Platform administrator only. Requires an acknowledged held update, retained patch and distinct current GetAssetGroup permission for the original account. First attempts reconciliation from the retained successful bound read with the supplied read_id, without another upstream call. Otherwise claims a fresh one-shot read, uses the bounded group-read worker and persists its encrypted result. Authenticates both snapshots and compares the exact patch before atomically recording reconciliation and releasing the hold. Mismatch preserves the hold; uncertain or already reconciled updates never dispatch a read. No mutation replay or inference charge. Caller disconnect leaves tracked work running. Process recovery remains separately qualified.

Operation: `post--api-v1-vendors--id--asset-management-group-updates--update--reconcile`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/vendors/{id}/asset-management/group-updates/{update}/reconcile" \
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

### update

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
    "read_id"
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
    "read_id": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

## Responses

### HTTP 200

data contains update_id, status reconciled and reconciliation_required false.

### HTTP 400

Snapshot invalid or requested metadata does not match; hold preserved.

### HTTP 401

Authentication required.

### HTTP 403

Platform access or read permission unavailable.

### HTTP 404

Update unavailable in this account and workspace.

### HTTP 409

Read identity consumed, content unavailable, update not acknowledged/held or original qualification unavailable.

### HTTP 422

Malformed request.

### HTTP 503

Read capacity, encryption, transport or durable persistence unavailable.

## Behavior and supported scope

Platform administrator only. Requires an acknowledged held update, retained patch and distinct current GetAssetGroup permission for the original account. First attempts reconciliation from the retained successful bound read with the supplied read_id, without another upstream call. Otherwise claims a fresh one-shot read, uses the bounded group-read worker and persists its encrypted result. Authenticates both snapshots and compares the exact patch before atomically recording reconciliation and releasing the hold. Mismatch preserves the hold; uncertain or already reconciled updates never dispatch a read. No mutation replay or inference charge. Caller disconnect leaves tracked work running. Process recovery remains separately qualified.
