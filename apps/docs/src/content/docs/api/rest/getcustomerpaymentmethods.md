---
title: "Read company checkout availability"
description: "GET /api/v1/organizations/{organization}/billing/payment-methods"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/billing/payment-methods`

Organization-wide owner/admin with read access or installation administrator only. Returns enabled merchant method codes for the requested currency when configured and an account exists. Omitted currency preserves the configured default. No merchant credentials, account identifiers or upstream queries. Availability does not guarantee collection or grant write permission. No FX or account provisioning is implied.

Operation: `getCustomerPaymentMethods`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/payment-methods" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
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

Location: **query**. Optional.

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
}
```

### payment_gateway

Location: **query**. Optional. Select one configured integration without falling through to another.

```json
{
  "type": "string",
  "enum": [
    "epay",
    "stripe",
    "zhifux"
  ]
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Configured checkout methods or explicit unavailable state

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
      "additionalProperties": false,
      "required": [
        "currency",
        "payment_gateway",
        "available",
        "payment_methods",
        "unavailable_reason"
      ],
      "properties": {
        "currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$"
        },
        "available": {
          "type": "boolean"
        },
        "payment_methods": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Empty when unavailable; exact configured codes otherwise."
        },
        "payment_gateway": {
          "type": [
            "string",
            "null"
          ],
          "enum": [
            "epay",
            "stripe",
            "zhifux",
            null
          ],
          "description": "Selected configured integration for these methods. Forward this value with currency when creating a top-up; null means no matching integration. This is adapter identity, not merchant credentials or a payment-method display label."
        },
        "unavailable_reason": {
          "type": [
            "string",
            "null"
          ],
          "enum": [
            "integration_unavailable",
            "currency_account_missing",
            null
          ]
        }
      }
    }
  }
}
```

### HTTP 400

Invalid company identifier or currency query

### HTTP 401

Authentication required

### HTTP 404

Company billing access not granted

### HTTP 503

Durable account storage unavailable

## Behavior and supported scope

Organization-wide owner/admin with read access or installation administrator only. Returns enabled merchant method codes for the requested currency when configured and an account exists. Omitted currency preserves the configured default. No merchant credentials, account identifiers or upstream queries. Availability does not guarantee collection or grant write permission. No FX or account provisioning is implied.

**Supported scope:** implemented
