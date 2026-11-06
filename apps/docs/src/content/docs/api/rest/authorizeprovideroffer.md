---
title: "Authorize and enable the current Provider offer"
description: "PUT /api/v1/providers/{provider}/offers/{offer}/authorization"
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/providers/{provider}/offers/{offer}/authorization`

Platform administration required. Atomically authorizes and enables the exact current rate revision for the Provider-owned enabled route and saved credential. A stale revision or unavailable route returns 409. Repeating a successful request for the same current revision returns its existing authorization. This does not verify upstream access, create a workspace selling price, or grant customer access. Media liability requirements remain independent.

Operation: `authorizeProviderOffer`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/providers/{provider}/offers/{offer}/authorization" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### provider

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### offer

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
    "rate_revision"
  ],
  "properties": {
    "rate_revision": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

## Responses

### HTTP 200

Authorized and enabled

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
        "active",
        "authorization_id"
      ],
      "properties": {
        "active": {
          "type": "boolean"
        },
        "authorization_id": {
          "type": "string",
          "format": "uuid"
        }
      }
    }
  }
}
```

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 409

Offer revision or route is unavailable

## Behavior and supported scope

Platform administration required. Atomically authorizes and enables the exact current rate revision for the Provider-owned enabled route and saved credential. A stale revision or unavailable route returns 409. Repeating a successful request for the same current revision returns its existing authorization. This does not verify upstream access, create a workspace selling price, or grant customer access. Media liability requirements remain independent.

**Supported scope:** implemented
