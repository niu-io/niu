---
title: "Create a platform upstream cost budget (installation only)"
description: "POST /admin/v1/organizations/{organization}/projects/{project}/budget"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/organizations/{organization}/projects/{project}/budget`

Fails with conflict if a budget exists. Previously dispatched work is not retroactively reserved. Further dispatch requires a trusted held reservation; configure pricing separately in the model route.

Operation: `createProjectBudget`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/budget" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "currency",
    "limit_nanos"
  ],
  "properties": {
    "currency": {
      "type": "string",
      "pattern": "^[A-Z]{3}$"
    },
    "limit_nanos": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Nonnegative integer billionths of currency, at most 9223372036854775807."
    }
  }
}
```

## Responses

### HTTP 201

Created budget snapshot with decimal-string amounts and lifetime period.

### HTTP 400

Invalid currency or amount.

### HTTP 401

Administrator authentication required.

### HTTP 409

Budget already exists or the project is absent from the organization.

### HTTP 422

JSON does not match the required schema.

## Behavior and supported scope

Fails with conflict if a budget exists. Previously dispatched work is not retroactively reserved. Further dispatch requires a trusted held reservation; configure pricing separately in the model route.
