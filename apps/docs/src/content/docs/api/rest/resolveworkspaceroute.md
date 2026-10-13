---
title: "Resolve an authorized canonical workspace route"
description: "GET /admin/v1/workspaces/by-route/{route_slug}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/workspaces/by-route/{route_slug}`

Exact persisted route lookup independent of workspace list limits. Renames preserve the route. Historical name aliases are not supported. Foreign, missing and malformed references return the same 404.

Operation: `resolveWorkspaceRoute`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/workspaces/by-route/{route_slug}" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

### route_slug

Location: **path**. **Required.**

```json
{
  "type": "string",
  "maxLength": 81
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Authorized workspace identity.

Response headers:

```json
{
  "Cache-Control": {
    "schema": {
      "type": "string",
      "const": "no-store"
    }
  }
}
```

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "id",
    "organization_id",
    "name",
    "route_slug"
  ],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "organization_id": {
      "type": "string",
      "format": "uuid"
    },
    "name": {
      "type": "string"
    },
    "route_slug": {
      "type": "string",
      "maxLength": 81,
      "description": "Immutable routing reference, never a display label or authorization grant."
    }
  }
}
```

### HTTP 401

Invalid or inference-only credential.

### HTTP 403

Credential lacks read permission.

### HTTP 404

No authorized workspace matches the reference.

## Behavior and supported scope

Exact persisted route lookup independent of workspace list limits. Renames preserve the route. Historical name aliases are not supported. Foreign, missing and malformed references return the same 404.

**Supported scope:** implemented
