---
title: "Rename a workspace by identity"
description: "PATCH /api/v1/workspaces/{workspace}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PATCH /api/v1/workspaces/{workspace}`

Compatibility alias for the existing organization/workspace endpoint, which remains supported. Authorization is checked before resolving the stored workspace organization; member scope filters the lookup and foreign or missing workspaces return 404. The existing handler rechecks authorization before mutation. Requires scoped workspace write access. Trims the saved name; no optimistic revision is accepted. Response matches the legacy rename endpoint. Unknown body properties retain legacy parser behavior.

Operation: `renameWorkspaceById`.

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
curl --fail-with-body -X PATCH "$NIU_ORIGIN/api/v1/workspaces/{workspace}" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

Saved workspace identity and trimmed name.

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

Invalid identifier or name.

### HTTP 401

Authentication required.

### HTTP 403

Required management permission is missing.

### HTTP 404

Workspace missing or outside authorized scope.

### HTTP 415

JSON content type required.

### HTTP 422

Invalid JSON body shape.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Compatibility alias for the existing organization/workspace endpoint, which remains supported. Authorization is checked before resolving the stored workspace organization; member scope filters the lookup and foreign or missing workspaces return 404. The existing handler rechecks authorization before mutation. Requires scoped workspace write access. Trims the saved name; no optimistic revision is accepted. Response matches the legacy rename endpoint. Unknown body properties retain legacy parser behavior.

**Supported scope:** implemented
