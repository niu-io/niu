---
title: "Erase retained metadata-update patch"
description: "DELETE /admin/v1/vendors/{id}/asset-management/group-updates/{update}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /admin/v1/vendors/{id}/asset-management/group-updates/{update}`

Platform administrator only, exact saved workspace/account binding. Idempotent erasure, including after grant revocation. Preserves immutable audit, claims, holds and reconciliation. Does not cancel an already claimed mutation, release a hold or restore replay permission. Responses are no-store.

Operation: `delete--admin-v1-vendors--id--asset-management-group-updates--update-`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/admin/v1/vendors/{id}/asset-management/group-updates/{update}" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
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

### organization_id

Location: **query**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### project_id

Location: **query**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 204

Patch erased or already absent.

### HTTP 401

Authentication required.

### HTTP 403

Platform administrator required.

### HTTP 404

Update unavailable in this account and workspace.

## Behavior and supported scope

Platform administrator only, exact saved workspace/account binding. Idempotent erasure, including after grant revocation. Preserves immutable audit, claims, holds and reconciliation. Does not cancel an already claimed mutation, release a hold or restore replay permission. Responses are no-store.
