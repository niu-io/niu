---
title: "Create or recover a company prepaid top-up"
description: "POST /api/v1/organizations/{organization}/billing/topups"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/billing/topups`

Organization-wide owner/admin with write access or installation administrator only. Requires an enabled method and an existing account in the selected integration's currency. Classic EPay and native Zhifux use CNY; Stripe uses its configured supported currency. Exact positive amounts must match the integration's minor-unit precision. No implicit account creation, FX or approved credit. Reuse the same idempotency key and identical intent after an uncertain response. Remote creation is durably claimed before contact and never automatically repeated; EPay atomically saves its intent and deterministic signed checkout locally. A checkout write failure rolls back a new intent; replay can complete an older saved intent without a link. Checkout alone grants no balance. Independently verified payment gates funding. Merchant credentials and enabled methods are deployment configuration. An explicit payment_gateway never falls through to another integration. Omission preserves runtime priority for compatibility.

Operation: `createCustomerTopup`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/topups" \
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
    "amount_nanos",
    "payment_method",
    "idempotency_key"
  ],
  "properties": {
    "currency": {
      "type": "string",
      "pattern": "^[A-Z]{3}$",
      "description": "Optional account currency. Selects a matching enabled integration; omission preserves existing default priority. Never implies conversion."
    },
    "payment_gateway": {
      "type": "string",
      "enum": [
        "epay",
        "stripe",
        "zhifux"
      ],
      "description": "Optional explicit integration. Never falls through to a different gateway; omission preserves default priority."
    },
    "amount_nanos": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Exact positive account-currency nanounits, at most 9223372036854775807. CNY requires divisibility by 10000000; other currencies require their supported minor-unit precision. Never a JSON number."
    },
    "payment_method": {
      "type": "string",
      "minLength": 1,
      "maxLength": 64,
      "pattern": "^[A-Za-z0-9.-]+$",
      "description": "Must be enabled for the configured merchant."
    },
    "idempotency_key": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

## Responses

### HTTP 200

Saved top-up status; checkout and pending status confer no spending capacity

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
        "id",
        "currency",
        "amount_nanos",
        "payment_method",
        "status",
        "checkout_url"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid",
          "description": "Internal API routing reference; never display as a product label."
        },
        "currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$",
          "description": "Immutable saved account currency; no implicit conversion."
        },
        "amount_nanos": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "payment_method": {
          "type": "string"
        },
        "status": {
          "type": "string",
          "enum": [
            "reconciliation_required",
            "pending",
            "paid",
            "closed"
          ]
        },
        "checkout_url": {
          "type": [
            "string",
            "null"
          ],
          "format": "uri",
          "description": "Validated HTTPS checkout for pending orders only; null for paid and closed orders."
        }
      }
    }
  }
}
```

### HTTP 400

Invalid amount or unavailable payment method

### HTTP 401

Authentication required

### HTTP 403

Write permission required

### HTTP 404

Company billing access not granted

### HTTP 409

Missing currency account or conflicting saved intent

### HTTP 422

Invalid body schema or unexpected field

### HTTP 502

Integration unavailable or checkout creation uncertain; preserve the intent and idempotency key

### HTTP 503

Durable storage unavailable; no successful creation is implied

## Behavior and supported scope

Organization-wide owner/admin with write access or installation administrator only. Requires an enabled method and an existing account in the selected integration's currency. Classic EPay and native Zhifux use CNY; Stripe uses its configured supported currency. Exact positive amounts must match the integration's minor-unit precision. No implicit account creation, FX or approved credit. Reuse the same idempotency key and identical intent after an uncertain response. Remote creation is durably claimed before contact and never automatically repeated; EPay atomically saves its intent and deterministic signed checkout locally. A checkout write failure rolls back a new intent; replay can complete an older saved intent without a link. Checkout alone grants no balance. Independently verified payment gates funding. Merchant credentials and enabled methods are deployment configuration. An explicit payment_gateway never falls through to another integration. Omission preserves runtime priority for compatibility.

**Supported scope:** implemented
