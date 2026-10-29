---
title: "Archive or restore the authenticated owner's Chat session"
description: "PUT /api/v1/workspaces/{workspace}/chats/{id}/archive"
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/workspaces/{workspace}/chats/{id}/archive`

Updates backend-owned archive state without changing content or conversation ordering. Autosaves preserve archive state. Repeating the same value is idempotent. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

Operation: `setChatSessionArchivedByWorkspace`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/workspaces/{workspace}/chats/{id}/archive" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### workspace

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

Updates backend-owned archive state without changing content or conversation ordering. Autosaves preserve archive state. Repeating the same value is idempotent. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

**Supported scope:** implemented
