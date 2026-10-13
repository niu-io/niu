---
title: "Erase retained ordinary asset listing content"
description: "DELETE /admin/v1/vendors/{id}/asset-management/listings/{listing}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /admin/v1/vendors/{id}/asset-management/listings/{listing}`

Platform administrator only. Local idempotent erasure and immutable tombstone; preserves audit and upstream assets. Also prevents in-flight work from retaining late content. Does not require a still-valid operation grant.

Operation: `delete--admin-v1-vendors--id--asset-management-listings--listing-`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/admin/v1/vendors/{id}/asset-management/listings/{listing}" \
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

### listing

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

Scoped content absent or erased.

### HTTP 401

Authentication required.

### HTTP 403

Platform administrator required.

## Behavior and supported scope

Platform administrator only. Local idempotent erasure and immutable tombstone; preserves audit and upstream assets. Also prevents in-flight work from retaining late content. Does not require a still-valid operation grant.
