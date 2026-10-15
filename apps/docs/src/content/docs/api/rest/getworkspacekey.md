---
title: "Retrieve a workspace API key with its policies and usage window"
description: "GET /api/v1/workspaces/{workspace}/keys/{key}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/workspaces/{workspace}/keys/{key}`

Returns metadata, spending limits, RPM/TPM/concurrency limits, IP allowlist policy, and 60-second usage window for a single workspace API key.

Operation: `getWorkspaceKey`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/workspaces/{workspace}/keys/{key}" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
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

Workspace API key detail

Content type: `application/json`.

```json
{
  "type": "object"
}
```

## Behavior and supported scope

Returns metadata, spending limits, RPM/TPM/concurrency limits, IP allowlist policy, and 60-second usage window for a single workspace API key.

**Supported scope:** implemented
