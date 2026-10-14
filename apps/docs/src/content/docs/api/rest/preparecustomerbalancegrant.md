---
title: "Prepare a durable noncash gift intent"
description: "POST /admin/v1/organizations/{organization}/billing/accounts/{currency}/grants/prepare"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/organizations/{organization}/billing/accounts/{currency}/grants/prepare`

Explicit platform administration only. Saves immutable amount, reason, currency, policy, authenticated actor and company-scoped idempotency key. Preparation posts no funds, revenue, receipt, debt application or reservation. Exact retries return the same intent; changed reuse conflicts. Existing matching grants can be recovered as issued. Publish through grantCustomerBalance with this saved input and original key. Prepared is not proof that an in-flight publication failed. Never invent another key because a response was lost. No automatic issuance. Internal references are not product labels.

Operation: `prepareCustomerBalanceGrant`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/organizations/{organization}/billing/accounts/{currency}/grants/prepare" \
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

Durable intent state

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
        "idempotency_key",
        "currency",
        "amount_nanos",
        "reason",
        "created_at",
        "application_policy",
        "status",
        "result"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "idempotency_key": {
          "type": "string",
          "format": "uuid"
        },
        "currency": {
          "type": "string"
        },
        "amount_nanos": {
          "type": "string"
        },
        "reason": {
          "type": "string"
        },
        "created_at": {
          "type": "string",
          "format": "date-time"
        },
        "application_policy": {
          "type": "string",
          "enum": [
            "future_only",
            "unpaid_credit_first"
          ]
        },
        "status": {
          "type": "string",
          "enum": [
            "prepared",
            "issued"
          ]
        },
        "result": {
          "type": [
            "object",
            "null"
          ],
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
  }
}
```

### HTTP 400

Invalid amount, currency or page

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 409

Intent conflict, unknown company or invalid cursor

### HTTP 422

Malformed body or unsupported application policy

## Behavior and supported scope

Explicit platform administration only. Saves immutable amount, reason, currency, policy, authenticated actor and company-scoped idempotency key. Preparation posts no funds, revenue, receipt, debt application or reservation. Exact retries return the same intent; changed reuse conflicts. Existing matching grants can be recovered as issued. Publish through grantCustomerBalance with this saved input and original key. Prepared is not proof that an in-flight publication failed. Never invent another key because a response was lost. No automatic issuance. Internal references are not product labels.

**Supported scope:** implemented
