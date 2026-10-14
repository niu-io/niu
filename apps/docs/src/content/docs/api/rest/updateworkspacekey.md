---
title: "Update workspace API key metadata and policies"
description: "PATCH /api/v1/workspaces/{workspace}/keys/{key}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PATCH /api/v1/workspaces/{workspace}/keys/{key}`

Updates key name, model grants, spending limit, RPM/TPM/concurrency limits, and IP allowlist policy in a single request and returns the updated key detail.

Operation: `updateWorkspaceKey`.

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
curl --fail-with-body -X PATCH "$NIU_ORIGIN/api/v1/workspaces/{workspace}/keys/{key}" \
  -H "Authorization: Bearer $NIU_API_KEY" \
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

### key

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
  "type": "object"
}
```

## Responses

### HTTP 200

Updated workspace API key detail

Content type: `application/json`.

```json
{
  "type": "object"
}
```

## Behavior and supported scope

Updates key name, model grants, spending limit, RPM/TPM/concurrency limits, and IP allowlist policy in a single request and returns the updated key detail.

**Supported scope:** implemented
