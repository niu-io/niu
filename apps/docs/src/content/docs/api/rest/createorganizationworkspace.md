---
title: "Create a workspace in the selected company"
description: "POST /api/v1/organizations/{organization}/projects"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/projects`

Legacy workspace-compatible endpoint. Uses the same company creation authorization and actor-scoped durable Idempotency-Key identity as canonical workspace creation. Returns only id, organization_id and name. Identical retries preserve one workspace; changed retry documents conflict. Workspace members cannot create sibling workspaces. New workspaces do not create funding or credit. Request fields other than name are ignored by the legacy parser.

Operation: `createOrganizationWorkspace`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/projects" \
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

### Idempotency-Key

Location: **header**. Optional. Visible ASCII durable retry identity, scoped to the actor.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 128
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
      "type": "string"
    }
  }
}
```

## Responses

### HTTP 201

Created workspace or durable replay of its current identity.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "id",
    "organization_id",
    "name"
  ],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "name": {
      "type": "string"
    },
    "organization_id": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

### HTTP 400

Invalid name or idempotency header.

### HTTP 401

Authentication required.

### HTTP 403

Workspace creation denied.

### HTTP 404

Company outside authorized scope.

### HTTP 409

Conflicting idempotency document.

### HTTP 422

Missing or type-invalid name in JSON body.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Legacy workspace-compatible endpoint. Uses the same company creation authorization and actor-scoped durable Idempotency-Key identity as canonical workspace creation. Returns only id, organization_id and name. Identical retries preserve one workspace; changed retry documents conflict. Workspace members cannot create sibling workspaces. New workspaces do not create funding or credit. Request fields other than name are ignored by the legacy parser.

**Supported scope:** implemented
