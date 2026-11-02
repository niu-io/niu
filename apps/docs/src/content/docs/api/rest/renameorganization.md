---
title: "Rename an organization"
description: "PATCH /api/v1/organizations/{organization}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`PATCH /api/v1/organizations/{organization}`

Requires installation write access or an organization-wide owner membership. Trims the saved name and preserves the immutable organization slug and aliases.

Operation: `renameOrganization`.

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
curl --fail-with-body -X PATCH "$NIU_ORIGIN/api/v1/organizations/{organization}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "required": [
    "name"
  ],
  "properties": {
    "name": {
      "type": "string",
      "description": "Must contain non-whitespace text and be at most 200 UTF-8 bytes before trimming."
    }
  }
}
```

## Responses

### HTTP 200

Updated organization metadata.

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

### HTTP 400

Invalid name or identifier.

### HTTP 401

Authentication required.

### HTTP 403

Organization-wide owner or installation write permission required.

### HTTP 404

Organization missing or outside authorized scope.

## Behavior and supported scope

Requires installation write access or an organization-wide owner membership. Trims the saved name and preserves the immutable organization slug and aliases.

**Supported scope:** implemented
