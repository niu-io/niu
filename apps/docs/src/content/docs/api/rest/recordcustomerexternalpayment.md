---
title: "Record one confirmed full external invoice payment"
description: "POST /admin/v1/organizations/{organization}/projects/{project}/billing/invoices/{invoice}/payment"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/organizations/{organization}/projects/{project}/billing/invoices/{invoice}/payment`

Installation only. Records a full external payment only for a positive invoice with no balance-bound charges. Mixed invoices, balance-backed invoices and zero-value invoices conflict. Does not top up an account or accept partial payments. Existing exact retries remain idempotent. Does not charge any payment method. References cannot be reused on another invoice. Cache-Control is no-store.

Operation: `recordCustomerExternalPayment`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/billing/invoices/{invoice}/payment" \
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

### invoice

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
    "payment_reference"
  ],
  "properties": {
    "payment_reference": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200,
      "description": "Trimmed nonempty external payment reference; maximum 200 UTF-8 bytes and no control characters."
    }
  }
}
```

## Responses

### HTTP 200

Invoice identity, including an exact idempotent replay

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
        "id"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid reference

### HTTP 403

Installation authority required

### HTTP 409

Invoice missing, balance-bound or zero-value invoice, already recorded with another reference, or reference already used

## Behavior and supported scope

Installation only. Records a full external payment only for a positive invoice with no balance-bound charges. Mixed invoices, balance-backed invoices and zero-value invoices conflict. Does not top up an account or accept partial payments. Existing exact retries remain idempotent. Does not charge any payment method. References cannot be reused on another invoice. Cache-Control is no-store.
