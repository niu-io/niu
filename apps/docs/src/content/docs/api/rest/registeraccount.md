---
title: "Register an unverified account"
description: "POST /api/v1/organizations/{organization}/projects/{project}/accounts"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/projects/{project}/accounts`



Operation: `registerAccount`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/accounts" \
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
  "required": [
    "provider",
    "plan",
    "authentication_mode",
    "billing_mode",
    "credential_reference",
    "concurrency_limit"
  ],
  "properties": {
    "provider": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "plan": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "authentication_mode": {
      "type": "string",
      "enum": [
        "api_key",
        "oauth_refresh"
      ]
    },
    "billing_mode": {
      "type": "string",
      "enum": [
        "metered_api",
        "subscription"
      ]
    },
    "credential_reference": {
      "type": "string",
      "description": "Opaque env or secret reference, never the secret value."
    },
    "concurrency_limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 10000
    }
  }
}
```

## Responses

### HTTP 201

Account registered as unverified, or metadata returned. Registration does not activate inference.

### HTTP 401

Invalid administrator token.

## Behavior and supported scope
