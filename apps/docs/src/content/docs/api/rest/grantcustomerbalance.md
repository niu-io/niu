---
title: "Issue administrator noncash customer credit"
description: "POST /api/v1/organizations/{organization}/billing/accounts/{currency}/grants"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/billing/accounts/{currency}/grants`

Explicit platform administration required. Atomically records a positive gift and its immutable noncash memorandum, reason and authenticated actor. Issuance is not a payment receipt or revenue. application_policy defaults to future_only for compatibility. Explicit unpaid_credit_first applies the new gift against exact known unpaid credit charges as sales allowance, reducing revenue and receivable without repricing the charge or changing Provider payable. Remaining gift funds future consumption. Unknown debt provenance rejects the complete publication. Refunds restore the corresponding gift before credit or cash, without evidence of an external cash transfer. Credit policy is unchanged. Exact retries using the same company-scoped idempotency key, currency, amount, reason and application policy return the original grant; differing reuse conflicts. Historical financial entries are never reclassified. No automatic retry.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/accounts/{currency}/grants" \
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
    "application_policy": {
      "type": "string",
      "enum": [
        "future_only",
        "unpaid_credit_first"
      ],
      "default": "future_only"
    },
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
        "id",
        "application_policy",
        "applied_to_credit_nanos",
        "retained_for_future_consumption_nanos"
      ],
      "properties": {
        "application_policy": {
          "type": "string",
          "enum": [
            "future_only",
            "unpaid_credit_first"
          ]
        },
        "applied_to_credit_nanos": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "retained_for_future_consumption_nanos": {
          "type": "string",
          "pattern": "^[0-9]+$",
          "description": "Original grant amount retained for future consumption at issuance, not current spendable balance."
        },
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

Unknown company, conflicting idempotency intent or uncovered debt sources for unpaid_credit_first

### HTTP 422

Malformed request body or unsupported application policy

## Behavior and supported scope

Explicit platform administration required. Atomically records a positive gift and its immutable noncash memorandum, reason and authenticated actor. Issuance is not a payment receipt or revenue. application_policy defaults to future_only for compatibility. Explicit unpaid_credit_first applies the new gift against exact known unpaid credit charges as sales allowance, reducing revenue and receivable without repricing the charge or changing Provider payable. Remaining gift funds future consumption. Unknown debt provenance rejects the complete publication. Refunds restore the corresponding gift before credit or cash, without evidence of an external cash transfer. Credit policy is unchanged. Exact retries using the same company-scoped idempotency key, currency, amount, reason and application policy return the original grant; differing reuse conflicts. Historical financial entries are never reclassified. No automatic retry.

**Supported scope:** implemented
