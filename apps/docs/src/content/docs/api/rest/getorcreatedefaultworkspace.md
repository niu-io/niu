---
title: "Get or create the installation default workspace"
description: "POST /api/v1/setup/default-workspace"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/setup/default-workspace`

Installation credential only. First use atomically creates company/workspace ownership and a zero-funded USD balance account with zero approved credit. Repeated and concurrent calls reuse the designated default. Existing defaults retain their billing configuration. Development login uses the same first-use initializer. No API key, payment receipt or spending capacity is created. No request body is required. The legacy project_id field identifies the workspace; these identifiers are routing references, not display labels.

Operation: `getOrCreateDefaultWorkspace`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/setup/default-workspace" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Stable default ownership references, without a data wrapper.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "organization_id",
    "project_id"
  ],
  "additionalProperties": false,
  "properties": {
    "organization_id": {
      "type": "string",
      "format": "uuid"
    },
    "project_id": {
      "type": "string",
      "format": "uuid",
      "description": "Workspace routing identifier."
    }
  }
}
```

### HTTP 401

Missing, invalid, expired or inference-only credential.

### HTTP 403

Authenticated member lacks installation authority, including a platform administrator.

## Behavior and supported scope

Installation credential only. First use atomically creates company/workspace ownership and a zero-funded USD balance account with zero approved credit. Repeated and concurrent calls reuse the designated default. Existing defaults retain their billing configuration. Development login uses the same first-use initializer. No API key, payment receipt or spending capacity is created. No request body is required. The legacy project_id field identifies the workspace; these identifiers are routing references, not display labels.

**Supported scope:** implemented
