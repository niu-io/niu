---
title: "Delete an empty workspace"
description: "DELETE /api/v1/organizations/{organization}/projects/{project}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /api/v1/organizations/{organization}/projects/{project}`

Requires installation authority or company-level membership with member-management permission. Workspace-scoped members cannot delete a workspace. Referenced workspaces are protected by storage foreign keys and return 409; no cascade deletion of business history is requested.

Operation: `deleteWorkspace`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}" \
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

### project

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

### HTTP 204

Workspace deleted; empty body

### HTTP 400

Invalid identifier

### HTTP 401

Authentication required

### HTTP 403

Required company-level management permission missing

### HTTP 404

Workspace missing or outside authorized scope

### HTTP 409

Workspace still has dependent records

### HTTP 503

Storage unavailable

## Behavior and supported scope

Requires installation authority or company-level membership with member-management permission. Workspace-scoped members cannot delete a workspace. Referenced workspaces are protected by storage foreign keys and return 409; no cascade deletion of business history is requested.

**Supported scope:** implemented
