---
title: "Archive or restore the authenticated owner's Chat session"
description: "PUT /api/v1/organizations/{organization}/projects/{project}/chats/{id}/archive"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/organizations/{organization}/projects/{project}/chats/{id}/archive`

Updates backend-owned archive state without changing content or conversation ordering. Autosaves preserve archive state. Repeating the same value is idempotent.

Operation: `setChatSessionArchived`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/chats/{id}/archive" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "archived"
  ],
  "properties": {
    "archived": {
      "type": "boolean"
    }
  }
}
```

## Responses

### HTTP 204

Archive state saved.

### HTTP 400

Invalid input.

### HTTP 401

Authentication required.

### HTTP 403

Workspace write access required.

### HTTP 404

No session in the caller's owner and workspace scope.

## Behavior and supported scope

Updates backend-owned archive state without changing content or conversation ordering. Autosaves preserve archive state. Repeating the same value is idempotent.
