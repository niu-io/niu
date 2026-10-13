---
title: "Delete imported samples for one provider quota window"
description: "DELETE /admin/v1/organizations/{organization}/projects/{project}/accounts/{account}/quota"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /admin/v1/organizations/{organization}/projects/{project}/accounts/{account}/quota`

Permanently removes every imported sample for the selected account window, including its comparison baseline. It does not call the provider, change account state, alter inference attempts, or modify the cost ledger.

Operation: `deleteAccountQuotaWindowHistory`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/accounts/{account}/quota" \
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

### window_key

Location: **query**. **Required.**

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 200
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Window history removed. The response includes the number of samples deleted; repeating the same request deletes zero additional samples.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "window_key",
    "deleted_count"
  ],
  "properties": {
    "window_key": {
      "type": "string"
    },
    "deleted_count": {
      "type": "integer",
      "minimum": 0
    }
  }
}
```

### HTTP 400

Missing or invalid window key.

### HTTP 401

Invalid administrator token.

### HTTP 409

Supplier account is not in the requested project.

## Behavior and supported scope

Permanently removes every imported sample for the selected account window, including its comparison baseline. It does not call the provider, change account state, alter inference attempts, or modify the cost ledger.
