---
title: "Resolve an authorized canonical organization route"
description: "GET /api/v1/organizations/by-route/{route_slug}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/by-route/{route_slug}`

Exact persisted organization slug or alias lookup independent of directory page limits. Renames preserve the slug. Foreign, missing and malformed references return the same 404.

Operation: `resolveOrganizationRoute`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/by-route/{route_slug}" \
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

Authorized organization identity.

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
    "slug",
    "name"
  ],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "slug": {
      "type": "string",
      "maxLength": 81,
      "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$"
    },
    "slug_aliases": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "name": {
      "type": "string"
    }
  }
}
```

### HTTP 401

Invalid or inference-only credential.

### HTTP 403

Credential lacks read permission.

### HTTP 404

No authorized organization matches the reference.

## Behavior and supported scope

Exact persisted organization slug or alias lookup independent of directory page limits. Renames preserve the slug. Foreign, missing and malformed references return the same 404.

**Supported scope:** implemented
