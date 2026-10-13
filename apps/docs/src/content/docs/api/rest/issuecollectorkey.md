---
title: "Issue a scoped quota-observation collector credential"
description: "POST /admin/v1/organizations/{organization}/projects/{project}/collector-keys"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/organizations/{organization}/projects/{project}/collector-keys`



Operation: `issueCollectorKey`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/collector-keys" \
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
    "name",
    "ttl_seconds"
  ],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "ttl_seconds": {
      "type": "integer",
      "minimum": 60,
      "maximum": 31536000
    },
    "purpose": {
      "type": "string",
      "enum": [
        "quota"
      ],
      "default": "quota"
    }
  }
}
```

## Responses

### HTTP 200

Collector ID and one-time bearer token. Store the token securely; it is not returned again.

### HTTP 401

Administrator authentication required.

## Behavior and supported scope
