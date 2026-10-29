---
title: "Resolve an authorized canonical workspace route"
description: "GET /api/v1/workspaces/by-route/{route_slug}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/workspaces/by-route/{route_slug}`

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/workspaces/by-route/{route_slug}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
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
    "route_slug",
    "slug",
    "slug_aliases"
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
      "description": "Deprecated compatibility alias for slug.",
      "deprecated": true
    },
    "slug": {
      "type": "string",
      "maxLength": 81,
      "description": "Stable, readable workspace slug. Use in dashboard URLs; renaming preserves it."
    },
    "slug_aliases": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Previously issued slugs accepted for existing bookmarks."
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
