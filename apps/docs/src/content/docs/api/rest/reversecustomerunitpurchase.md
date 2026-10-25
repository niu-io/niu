---
title: "Reverse unoccupied Credits purchase ranges at processor minor-unit precision"
description: "POST /api/v1/organizations/{organization}/billing/units/purchases/{order}/reversals"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/billing/units/purchases/{order}/reversals`

Platform administration required. Records an immutable reversal of unoccupied ranges belonging to an original Credits purchase lot. The requested atom quantity must map to a positive whole minor-unit payment refund (divisible by 10000000 nanounits) with zero discarded residual atoms or backing. Simulated purchases preserve zero cash backing and never enter verified cash funding reversals. Identical idempotent replay returns the original receipt even after later charges, reversals or rule changes; conflicting reuse returns 409. Recording a reversal does not execute an external payment-processor transfer.

Operation: `reverseCustomerUnitPurchase`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/units/purchases/{order}/reversals" \
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

### order

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
    "credit_atoms",
    "reason",
    "idempotency_key"
  ],
  "properties": {
    "credit_atoms": {
      "type": "string",
      "pattern": "^[1-9][0-9]*$"
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

Immutable purchase reversal receipt

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "order_id",
        "lot_id",
        "definition_revision",
        "name",
        "display_precision",
        "atoms_per_unit",
        "provenance",
        "payment_currency",
        "processor_minor_unit_nanos",
        "credit_atoms",
        "refund_payment_nanos",
        "refund_backing_nanos",
        "reason",
        "created_at",
        "ranges"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "order_id": {
          "type": "string",
          "format": "uuid"
        },
        "lot_id": {
          "type": "string",
          "format": "uuid"
        },
        "definition_revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        },
        "name": {
          "type": "string"
        },
        "display_precision": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9
        },
        "atoms_per_unit": {
          "type": "string",
          "const": "1000000000"
        },
        "provenance": {
          "type": "string",
          "enum": [
            "purchased",
            "simulated"
          ]
        },
        "payment_currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$"
        },
        "processor_minor_unit_nanos": {
          "type": "string",
          "const": "10000000"
        },
        "credit_atoms": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        },
        "refund_payment_nanos": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        },
        "refund_backing_nanos": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "reason": {
          "type": "string"
        },
        "created_at": {
          "type": "string",
          "format": "date-time"
        },
        "ranges": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "first_atom",
              "end_atom",
              "credit_atoms",
              "payment_nanos",
              "backing_nanos"
            ],
            "properties": {
              "first_atom": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]*)$"
              },
              "end_atom": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              },
              "credit_atoms": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              },
              "payment_nanos": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]*)$"
              },
              "backing_nanos": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]*)$"
              }
            }
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid atom quantity, inexact processor minor-unit refund, residual atoms or invalid reason

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 404

No settled Credits purchase lot for the specified organization and order

### HTTP 409

Requested atoms exceed unoccupied capacity or idempotency key reused with different input

### HTTP 422

Malformed request body

### HTTP 503

Storage unavailable

## Behavior and supported scope

Platform administration required. Records an immutable reversal of unoccupied ranges belonging to an original Credits purchase lot. The requested atom quantity must map to a positive whole minor-unit payment refund (divisible by 10000000 nanounits) with zero discarded residual atoms or backing. Simulated purchases preserve zero cash backing and never enter verified cash funding reversals. Identical idempotent replay returns the original receipt even after later charges, reversals or rule changes; conflicting reuse returns 409. Recording a reversal does not execute an external payment-processor transfer.

**Supported scope:** implemented
