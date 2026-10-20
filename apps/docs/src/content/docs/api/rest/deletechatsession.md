---
title: "Delete an owned Chat session in a workspace"
description: "DELETE /api/v1/organizations/{organization}/projects/{project}/chats/{id}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /api/v1/organizations/{organization}/projects/{project}/chats/{id}`

Requires write access to the workspace. Deletion is scoped to the authenticated owner and workspace. Missing or already deleted sessions return the same result without disclosing another owner's history. Does not delete request accounting or billing records.

Operation: `deleteChatSession`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/chats/{id}" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

### organization

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### project

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### id

Location: **path**. **Required.**

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

Session deleted or absent.

### HTTP 401

Authentication required.

### HTTP 403

Workspace write access required.

## Behavior and supported scope

Requires write access to the workspace. Deletion is scoped to the authenticated owner and workspace. Missing or already deleted sessions return the same result without disclosing another owner's history. Does not delete request accounting or billing records.
