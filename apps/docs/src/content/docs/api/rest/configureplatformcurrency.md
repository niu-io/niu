---
title: "Configure the installation currency once"
description: "PUT /api/v1/platform/currency"
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/platform/currency`

Platform administration required. Repeating the same currency is safe; changing a configured currency returns 409. Historical records are not converted.

Operation: `configurePlatformCurrency`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/platform/currency" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

No path, query, or header parameters are declared.

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "required": [
    "currency"
  ],
  "additionalProperties": false,
  "properties": {
    "currency": {
      "type": "string",
      "pattern": "^[A-Z]{3}$"
    }
  }
}
```

## Responses

### HTTP 200

Configured currency.

### HTTP 409

Currency already configured with a different value.

## Behavior and supported scope

Platform administration required. Repeating the same currency is safe; changing a configured currency returns 409. Historical records are not converted.

**Supported scope:** implemented
