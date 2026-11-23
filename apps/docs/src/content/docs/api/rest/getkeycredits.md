---
title: "Read customer-facing balance summary for the authenticated API key's organization"
description: "GET /v1/credits"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

`GET /v1/credits`

Requires a current workspace API key. Returns customer-facing prepaid balance, reservations, and available balance per currency for the key's organization. Never exposes Provider purchase prices, upstream expenses, or platform margins.

Operation: `getKeyCredits`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  },
  {
    "niuApiKeyAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

Authentication alternative: `bearerAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/credits" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/credits" \
  -H "X-Niu-API-Key: $NIU_API_KEY"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Customer balance accounts for the authenticated key's organization.

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
          "currency"
        ],
        "properties": {
          "currency": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

### HTTP 401

Missing, revoked, expired or invalid key.

## Behavior and supported scope

Requires a current workspace API key. Returns customer-facing prepaid balance, reservations, and available balance per currency for the key's organization. Never exposes Provider purchase prices, upstream expenses, or platform margins.

**Supported scope:** implemented
