---
title: "Erase retained group-read content"
description: "DELETE /admin/v1/vendors/{id}/asset-management/group-reads/{read}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /admin/v1/vendors/{id}/asset-management/group-reads/{read}`

Platform administrator only. Idempotent scoped erasure. Records a deletion even during an in-flight read so later completion cannot restore content. Does not delete the upstream group or immutable audit. Content erasure remains available after read grant revocation.

Operation: `delete--admin-v1-vendors--id--asset-management-group-reads--read-`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/admin/v1/vendors/{id}/asset-management/group-reads/{read}" \
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

### read

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

Location: **query**. **Required.** Workspace routing identifier.

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

Content erased, already absent or outside the supplied scope.

### HTTP 401

Authentication required.

### HTTP 403

Platform administrator required.

## Behavior and supported scope

Platform administrator only. Idempotent scoped erasure. Records a deletion even during an in-flight read so later completion cannot restore content. Does not delete the upstream group or immutable audit. Content erasure remains available after read grant revocation.
