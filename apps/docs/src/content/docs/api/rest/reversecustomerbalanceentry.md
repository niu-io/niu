---
title: "Record a balance refund or settled-funding reversal"
description: "POST /api/v1/organizations/{organization}/billing/entries/{entry}/reversal"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/billing/entries/{entry}/reversal`

Installation write access only. Funding entries can be reversed; charge entries can be refunded to account balance. Original records remain immutable. Cumulative reversals cannot exceed the original amount. Identical idempotency-key replay applies once; conflicting reuse is rejected. A verified funding reversal may create debt and reduce available funds without releasing in-flight liabilities. This records a ledger adjustment and does not execute external refunds or payments.

Operation: `reverseCustomerBalanceEntry`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/entries/{entry}/reversal" \
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

### entry

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
    "idempotency_key"
  ],
  "properties": {
    "amount_nanos": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Positive signed-64-bit nanounit amount"
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

Recorded or identical replay

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
      },
      "required": [
        "recorded"
      ]
    }
  },
  "required": [
    "data"
  ]
}
```

### HTTP 400

Invalid amount

### HTTP 401

Authentication required

### HTTP 403

Installation write access required

### HTTP 409

Unknown or unsupported original entry, over-refund or conflicting replay

## Behavior and supported scope

Installation write access only. Funding entries can be reversed; charge entries can be refunded to account balance. Original records remain immutable. Cumulative reversals cannot exceed the original amount. Identical idempotency-key replay applies once; conflicting reuse is rejected. A verified funding reversal may create debt and reduce available funds without releasing in-flight liabilities. This records a ledger adjustment and does not execute external refunds or payments.

**Supported scope:** implemented
