---
title: "Delete retained content without deleting accounting records"
description: "DELETE /api/v1/organizations/{organization}/projects/{project}/requests/{attempt}/payloads"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /api/v1/organizations/{organization}/projects/{project}/requests/{attempt}/payloads`

Requires workspace write permission. A durable content-free deletion marker prevents concurrent or late capture from recreating deleted payloads, including deletion before capture. Accounting records remain unchanged. Cross-workspace or absent attempts do not create markers.

Operation: `deleteRequestPayload`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X DELETE "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/requests/{attempt}/payloads" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
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

### attempt

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

Scoped deletion completed; workspace write permission required.

### HTTP 401

Authentication required.

### HTTP 403

The authenticated role lacks the required permission.

### HTTP 404

Workspace is outside the authenticated scope.

## Behavior and supported scope

Requires workspace write permission. A durable content-free deletion marker prevents concurrent or late capture from recreating deleted payloads, including deletion before capture. Accounting records remain unchanged. Cross-workspace or absent attempts do not create markers.
