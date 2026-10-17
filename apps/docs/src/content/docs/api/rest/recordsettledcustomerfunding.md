---
title: "Record an externally verified settled customer payment"
description: "POST /api/v1/organizations/{organization}/billing/funding/settled"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/billing/funding/settled`

Installation write access only. Trusted administration must verify external payment settlement before calling. This is not a customer self-credit endpoint or a payment-channel callback integration. The channel/payment reference credits funds once; changed organization, currency or amount is a conflict. Pending payments must not be submitted. No commercial payment channel is implied by this administrative record API.

Operation: `recordSettledCustomerFunding`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/funding/settled" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN" \
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "currency",
    "amount_nanos",
    "channel",
    "payment_reference"
  ],
  "properties": {
    "currency": {
      "type": "string",
      "pattern": "^[A-Z]{3}$"
    },
    "amount_nanos": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Positive signed-64-bit nanounit amount"
    },
    "channel": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "payment_reference": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  }
}
```

## Responses

### HTTP 200

Recorded or identical receipt replay

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "recorded": {
          "type": "boolean",
          "const": true
        }
      }
    }
  }
}
```

### HTTP 400

Invalid funding details

### HTTP 401

Authentication required

### HTTP 403

Installation write access required

### HTTP 409

Unknown organization or conflicting payment reference

## Behavior and supported scope

Installation write access only. Trusted administration must verify external payment settlement before calling. This is not a customer self-credit endpoint or a payment-channel callback integration. The channel/payment reference credits funds once; changed organization, currency or amount is a conflict. Pending payments must not be submitted. No commercial payment channel is implied by this administrative record API.
