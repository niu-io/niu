---
title: "Delete an owned Chat session in a workspace"
description: "DELETE /api/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /api/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}`

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X DELETE "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
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
