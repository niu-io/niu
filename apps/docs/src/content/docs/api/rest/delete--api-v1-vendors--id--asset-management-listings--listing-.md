---
title: "Erase retained ordinary asset listing content"
description: "DELETE /api/v1/vendors/{id}/asset-management/listings/{listing}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /api/v1/vendors/{id}/asset-management/listings/{listing}`

Platform administrator only. Local idempotent erasure and immutable tombstone; preserves audit and upstream assets. Also prevents in-flight work from retaining late content. Does not require a still-valid operation grant.

Operation: `delete--api-v1-vendors--id--asset-management-listings--listing-`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/api/v1/vendors/{id}/asset-management/listings/{listing}" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  --url-query 'organization_id=<ORGANIZATION_ID>' \
  --url-query 'project_id=<PROJECT_ID>'
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
