---
title: "Find imported tasks linked to an account's assigned attempts"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/accounts/{account}/executions"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/accounts/{account}/executions`

Returns bounded metadata-only execution summaries whose span charge_ref matches an attempt UUID assigned to this account. Other reference namespaces remain unlinked.

Operation: `listExecutionsForAccount`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/accounts/{account}/executions" \
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

### account

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

Up to 100 metadata-only task links, newest import first.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "task_id",
          "source",
          "record_id",
          "imported_at"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "task_id": {
            "type": "string"
          },
          "source": {
            "type": "string"
          },
          "record_id": {
            "type": "string"
          },
          "imported_at": {
            "type": "string",
            "format": "date-time"
          }
        }
      }
    }
  }
}
```

### HTTP 401

Invalid administrator token.

### HTTP 409

Account is not available in this project.

## Behavior and supported scope

Returns bounded metadata-only execution summaries whose span charge_ref matches an attempt UUID assigned to this account. Other reference namespaces remain unlinked.
