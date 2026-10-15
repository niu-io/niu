---
title: "Rename a workspace"
description: "PATCH /api/v1/organizations/{organization}/projects/{project}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PATCH /api/v1/organizations/{organization}/projects/{project}`

Requires scoped workspace write access. Trims the saved name. Returns the existing workspace identity and new name; no optimistic revision is accepted.

Operation: `renameWorkspace`.

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
curl --fail-with-body -X PATCH "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}" \
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

Saved workspace name

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "id",
    "name"
  ],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "name": {
      "type": "string"
    }
  }
}
```

### HTTP 400

Invalid name or identifier

### HTTP 401

Authentication required

### HTTP 403

Write permission required

### HTTP 404

Workspace missing or outside authorized scope

### HTTP 422

Invalid body shape

### HTTP 503

Storage unavailable

## Behavior and supported scope

Requires scoped workspace write access. Trims the saved name. Returns the existing workspace identity and new name; no optimistic revision is accepted.

**Supported scope:** implemented
