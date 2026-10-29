---
title: "Erase retained group-read content"
description: "DELETE /api/v1/vendors/{id}/asset-management/group-reads/{read}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /api/v1/vendors/{id}/asset-management/group-reads/{read}`

Platform administrator only. Idempotent scoped erasure. Records a deletion even during an in-flight read so later completion cannot restore content. Does not delete the upstream group or immutable audit. Content erasure remains available after read grant revocation.

Operation: `delete--api-v1-vendors--id--asset-management-group-reads--read-`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/api/v1/vendors/{id}/asset-management/group-reads/{read}" \
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
