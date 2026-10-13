---
title: "Read the platform upstream cost budget (installation only)"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/budget"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/budget`



Operation: `getProjectBudget`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/budget" \
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

## Request body

No request body is declared.

## Responses

### HTTP 200

Budget data or null. limit_nanos, reserved_nanos and spent_nanos are exact decimal strings in billionths of currency. A null budget is not a zero limit.

### HTTP 400

Invalid path or query parameter.

### HTTP 401

Administrator authentication required.

## Behavior and supported scope
