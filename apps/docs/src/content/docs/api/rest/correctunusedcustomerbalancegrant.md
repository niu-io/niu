---
title: "Correct a wholly unused noncash gift"
description: "POST /api/v1/organizations/{organization}/billing/accounts/{currency}/grants/{grant}/correction"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/billing/accounts/{currency}/grants/{grant}/correction`

Explicit platform administration only. Corrects the full original gift on an account with no paid request history, consumption, refunds, open reservations or unknown financial sources. Atomically appends a negative balance adjustment and an immutable noncash correction with original grant, reason and authenticated actor. Does not change credit, create a merchant refund, cash receipt, consumption allowance or revenue. Partial, consumed, uncertain, duplicate or changed idempotency intent is refused. Exact same company/currency/grant/amount/reason/key retry returns the original correction. On uncertain response inspect issued gifts and retry only the exact original input, never replace the key. No automatic retry.

Operation: `correctUnusedCustomerBalanceGrant`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/accounts/{currency}/grants/{grant}/correction" \
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

### currency

Location: **path**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
}
```

### grant

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
    "reason",
    "idempotency_key"
  ],
  "properties": {
    "amount_nanos": {
      "type": "string",
      "pattern": "^[1-9][0-9]{0,18}$"
    },
    "reason": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500
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

Correction committed or identical original returned

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

Invalid exact amount, currency or reason

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 409

Gift is unavailable, not wholly unused, has uncertain sources or open liabilities, or intent conflicts

## Behavior and supported scope

Explicit platform administration only. Corrects the full original gift on an account with no paid request history, consumption, refunds, open reservations or unknown financial sources. Atomically appends a negative balance adjustment and an immutable noncash correction with original grant, reason and authenticated actor. Does not change credit, create a merchant refund, cash receipt, consumption allowance or revenue. Partial, consumed, uncertain, duplicate or changed idempotency intent is refused. Exact same company/currency/grant/amount/reason/key retry returns the original correction. On uncertain response inspect issued gifts and retry only the exact original input, never replace the key. No automatic retry.

**Supported scope:** implemented
