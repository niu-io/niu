---
title: "Revoke a workspace API key"
description: "DELETE /api/v1/workspaces/{workspace}/keys/{key}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /api/v1/workspaces/{workspace}/keys/{key}`

Idempotently revokes a workspace API key within the authorized workspace scope.

Operation: `revokeWorkspaceKey`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X DELETE "$NIU_ORIGIN/api/v1/workspaces/{workspace}/keys/{key}" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
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

### key

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

Key revoked

## Behavior and supported scope

Idempotently revokes a workspace API key within the authorized workspace scope.

**Supported scope:** implemented
