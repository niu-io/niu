---
title: "Read API key concurrency policy"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/concurrency-limit"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/concurrency-limit`

Scoped readers may inspect the policy shared across secret rotations.

Operation: `getKeyConcurrencyLimit`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/concurrency-limit" \
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

Null revision means never configured. Null removes the limit; zero denies dispatch.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "required": [
        "max_concurrent_requests",
        "revision",
        "active_requests"
      ],
      "properties": {
        "max_concurrent_requests": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 0,
          "maximum": 10000,
          "description": "Maximum unresolved dispatched requests; null is unlimited and zero denies dispatch."
        },
        "revision": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[1-9][0-9]*$"
        },
        "active_requests": {
          "type": "integer",
          "minimum": 0,
          "description": "Current unresolved dispatch count shared across rotations; includes work admitted before configuration."
        }
      }
    }
  }
}
```

### HTTP 401

Authentication required

### HTTP 403

Workspace access denied

### HTTP 404

Workspace is outside operator scope, or key is absent from authorized workspace

## Behavior and supported scope

Scoped readers may inspect the policy shared across secret rotations.

**Supported scope:** implemented
