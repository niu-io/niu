---
title: "Issue administrator noncash customer credit"
description: "POST /admin/v1/organizations/{organization}/billing/accounts/{currency}/grants"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/organizations/{organization}/billing/accounts/{currency}/grants`

Explicit platform administration required. Atomically records a positive gift and its immutable noncash memorandum, reason and authenticated actor. This is not a payment receipt, debt forgiveness, or revenue. The gift is allocated against future confirmed consumption and reduces recognized revenue when consumed. Credit policy is unchanged. Exact retries using the same company-scoped idempotency key, currency, amount and reason return the original grant; differing reuse conflicts. Historical financial entries are never reclassified. No automatic retry.

Operation: `grantCustomerBalance`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/organizations/{organization}/billing/accounts/{currency}/grants" \
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
    "amount_nanos",
    "reason",
    "idempotency_key"
  ],
  "properties": {
    "amount_nanos": {
      "type": "string",
      "pattern": "^[1-9][0-9]{0,18}$",
      "description": "Positive exact currency nanounits, maximum 9223372036854775807."
    },
    "reason": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500,
      "description": "Trimmed justification without control characters."
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

Gift issued, or identical previously committed gift returned

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

Explicit platform administration required

### HTTP 409

Unknown company or conflicting idempotency key

## Behavior and supported scope

Explicit platform administration required. Atomically records a positive gift and its immutable noncash memorandum, reason and authenticated actor. This is not a payment receipt, debt forgiveness, or revenue. The gift is allocated against future confirmed consumption and reduces recognized revenue when consumed. Credit policy is unchanged. Exact retries using the same company-scoped idempotency key, currency, amount and reason return the original grant; differing reuse conflicts. Historical financial entries are never reclassified. No automatic retry.

**Supported scope:** implemented
