---
title: "Read a workspace-scoped key policy assignment"
description: "GET /api/v1/organizations/{organization}/projects/{project}/keys/{key}/guardrail"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/keys/{key}/guardrail`



Operation: `get--api-v1-organizations--organization--projects--project--keys--key--guardrail`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "adminBearerAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/keys/{key}/guardrail" \
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

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### key

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

Data contains assignment_revision, policy_revision and policy, or null when no assignment exists in this workspace.

### HTTP 401

Authentication required.

### HTTP 403

Workspace read access required.

## Behavior and supported scope
