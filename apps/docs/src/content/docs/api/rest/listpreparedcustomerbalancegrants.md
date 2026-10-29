---
title: "Recover saved noncash grant publication intents"
description: "GET /api/v1/organizations/{organization}/billing/accounts/{currency}/grants/prepared"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/billing/accounts/{currency}/grants/prepared`

Explicit platform administration only. Currency-scoped immutable intents newest first by creation time and UUID. Follow next_before as before; limit defaults to 50, maximum 100. A cursor outside this company/currency conflicts. Each page uses a bounded read snapshot; pages are live, not a cross-page snapshot. Issued derives from the committed matching grant; result is original issuance allocation, not current spendable balance. Prepared never proves an in-flight publication failed and never adds capacity. Reasons are platform-only. No cash references, customer content or credentials. Cache-Control no-store. Saved intent survives browser changes.

Operation: `listPreparedCustomerBalanceGrants`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/accounts/{currency}/grants/prepared" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
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

### before

Location: **query**. Optional.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 50
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Durable intent state

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_before"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
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
    },
    "next_before": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
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

## Behavior and supported scope

Explicit platform administration only. Currency-scoped immutable intents newest first by creation time and UUID. Follow next_before as before; limit defaults to 50, maximum 100. A cursor outside this company/currency conflicts. Each page uses a bounded read snapshot; pages are live, not a cross-page snapshot. Issued derives from the committed matching grant; result is original issuance allocation, not current spendable balance. Prepared never proves an in-flight publication failed and never adds capacity. Reasons are platform-only. No cash references, customer content or credentials. Cache-Control no-store. Saved intent survives browser changes.

**Supported scope:** implemented
