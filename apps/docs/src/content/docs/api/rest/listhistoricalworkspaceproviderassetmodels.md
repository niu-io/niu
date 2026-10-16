---
title: "Discover saved native-operation model contexts"
description: "GET /api/v1/organizations/{organization}/projects/{project}/media/asset-operation-models"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/media/asset-operation-models`

Requires current workspace Read permission. Lists distinct recorded public model aliases for the original scoped key, including expired or revoked keys and deleted resources. Never consults current model grants, restores inference authority, selects a Provider account or calls upstream. Each alias may have several saved account bindings; it grants historical inspection only. Alias pagination is lexical and includes all recorded operation statuses.

Operation: `listHistoricalWorkspaceProviderAssetModels`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/media/asset-operation-models" \
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

Location: **path**. **Required.** Workspace under the legacy API field name.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### key_id

Location: **query**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### after

Location: **query**. Optional.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 512
}
```

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 50
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Recorded aliases and exclusive lexical continuation cursor.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_cursor"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "next_cursor": {
      "type": [
        "string",
        "null"
      ]
    }
  }
}
```

### HTTP 400

Invalid filters.

### HTTP 401

Authentication required.

### HTTP 403

Workspace Read permission required.

### HTTP 409

Original key does not belong to this workspace.

## Behavior and supported scope

Requires current workspace Read permission. Lists distinct recorded public model aliases for the original scoped key, including expired or revoked keys and deleted resources. Never consults current model grants, restores inference authority, selects a Provider account or calls upstream. Each alias may have several saved account bindings; it grants historical inspection only. Alias pagination is lexical and includes all recorded operation statuses.

**Supported scope:** implemented
