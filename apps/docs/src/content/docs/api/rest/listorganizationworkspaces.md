---
title: "List scoped company workspaces"
description: "GET /api/v1/organizations/{organization}/projects"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects`

Legacy workspace-compatible endpoint. Installation authority sees up to 1000 company workspaces in creation order; member results are restricted to their authorized scope. Returns id/name only; use canonical workspace listing for richer metadata. Foreign company scope is concealed with 404.

Operation: `listOrganizationWorkspaces`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
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

No request body is declared.

## Responses

### HTTP 200

Authorized workspace names.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
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
    }
  }
}
```

### HTTP 401

Authentication required.

### HTTP 404

Company outside authorized scope.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Legacy workspace-compatible endpoint. Installation authority sees up to 1000 company workspaces in creation order; member results are restricted to their authorized scope. Returns id/name only; use canonical workspace listing for richer metadata. Foreign company scope is concealed with 404.

**Supported scope:** implemented
