---
title: "Set company low-balance warning threshold"
description: "PUT /api/v1/organizations/{organization}/billing/accounts/{currency}/warning-threshold"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/organizations/{organization}/billing/accounts/{currency}/warning-threshold`

Organization-wide owner/admin with write access or installation administrator only. Updates an existing account warning preference with revision checking; never changes funds or approved credit. Null or omitted threshold disables the warning. This does not configure external notifications.

Operation: `setCustomerBalanceWarning`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/accounts/{currency}/warning-threshold" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
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

### currency

Location: **path**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
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
    "expected_revision"
  ],
  "properties": {
    "warning_threshold_nanos": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$",
      "description": "Exact nonnegative nanounits up to 9223372036854775807; null disables the warning."
    },
    "expected_revision": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Exact current policy revision from zero through 9223372036854775806."
    }
  }
}
```

## Responses

### HTTP 200

Updated preference revision

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "revision": {
          "type": "string",
          "pattern": "^[0-9]+$"
        }
      },
      "required": [
        "revision"
      ]
    }
  },
  "required": [
    "data"
  ]
}
```

### HTTP 400

Invalid amount or revision

### HTTP 401

Authentication required

### HTTP 403

Write permission required

### HTTP 404

Company billing access not granted

### HTTP 409

Missing account or stale revision

### HTTP 422

Invalid body schema or unexpected field

## Behavior and supported scope

Organization-wide owner/admin with write access or installation administrator only. Updates an existing account warning preference with revision checking; never changes funds or approved credit. Null or omitted threshold disables the warning. This does not configure external notifications.

**Supported scope:** implemented
