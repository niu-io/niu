---
title: "Delete an empty workspace by identity"
description: "DELETE /api/v1/workspaces/{workspace}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /api/v1/workspaces/{workspace}`

Compatibility alias for the existing organization/workspace endpoint, which remains supported. Authorization is checked before resolving the stored workspace organization; member scope filters the lookup and foreign or missing workspaces return 404. The existing handler rechecks authorization before mutation. Requires installation authority or company-level owner/member-management permission. Workspace-scoped owners are refused with 403 before lookup for their own scope; another workspace remains concealed with 404. Dependent business records prevent deletion with 409; no business history cascade is requested. Response is the same empty 204 as the legacy endpoint.

Operation: `deleteWorkspaceById`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/api/v1/workspaces/{workspace}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
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

No request body is declared.

## Responses

### HTTP 204

Workspace deleted; empty response body.

### HTTP 400

Invalid identifier.

### HTTP 401

Authentication required.

### HTTP 403

Required management permission is missing.

### HTTP 404

Workspace missing or outside authorized scope.

### HTTP 409

Workspace retains dependent business records.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Compatibility alias for the existing organization/workspace endpoint, which remains supported. Authorization is checked before resolving the stored workspace organization; member scope filters the lookup and foreign or missing workspaces return 404. The existing handler rechecks authorization before mutation. Requires installation authority or company-level owner/member-management permission. Workspace-scoped owners are refused with 403 before lookup for their own scope; another workspace remains concealed with 404. Dependent business records prevent deletion with 409; no business history cascade is requested. Response is the same empty 204 as the legacy endpoint.

**Supported scope:** implemented
