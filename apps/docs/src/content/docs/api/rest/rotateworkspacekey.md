---
title: "Rotate a workspace API key while preserving its policies and expiry"
description: "POST /api/v1/workspaces/{workspace}/keys/{key}/rotate"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/workspaces/{workspace}/keys/{key}/rotate`

Atomically revokes the existing key and issues a replacement key sharing the same model grants, expiration, and policy lineage.

Operation: `rotateWorkspaceKey`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/workspaces/{workspace}/keys/{key}/rotate" \
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

### HTTP 201

Replacement key identity, one-time secret, and full key detail

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "id",
    "token",
    "key"
  ],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "token": {
      "type": "string"
    },
    "key": {
      "type": "object"
    }
  }
}
```

## Behavior and supported scope

Atomically revokes the existing key and issues a replacement key sharing the same model grants, expiration, and policy lineage.

**Supported scope:** implemented
