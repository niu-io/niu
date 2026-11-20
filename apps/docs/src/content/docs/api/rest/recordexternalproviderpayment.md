---
title: "Record an already completed external Provider payment"
description: "POST /api/v1/providers/{provider}/settlements"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/providers/{provider}/settlements`

Platform administration required; Provider membership does not grant this write. Does not transfer funds or overpay. Send either attempt_ids (legacy request-level selection) or currency plus cutoff_ms (period settlement); from_ms is an optional inclusive lower bound. Period settlement selects every unpaid earning of that Provider and currency created on or before cutoff_ms, computes the exact total and ignores request-level identifiers supplied in that mode. The period response reports the recorded amount, entry count, and unpaid amount remaining in that currency; neither mode returns customer, request, credential or customer-price detail. Reuse the supplied idempotency key with the identical mode, reference and period bounds for retries; entry order is irrelevant. Changed replay, duplicate payment reference, unavailable selection, or a period with no positive unpaid earnings returns 409. No customer balance credit or Provider authorization is created.

Operation: `recordExternalProviderPayment`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/providers/{provider}/settlements" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### provider

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### provider

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
  "oneOf": [
    {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "idempotency_key",
        "payment_reference",
        "attempt_ids"
      ],
      "properties": {
        "idempotency_key": {
          "type": "string",
          "format": "uuid"
        },
        "payment_reference": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200,
          "description": "Nonblank reference, at most 200 UTF-8 bytes, no control characters. Preserve the exact value on retry."
        },
        "attempt_ids": {
          "type": "array",
          "minItems": 1,
          "maxItems": 1000,
          "uniqueItems": true,
          "items": {
            "type": "string",
            "format": "uuid"
          },
          "description": "Legacy internal selection IDs from platform earning history. New callers should use the period mode."
        }
      }
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "idempotency_key",
        "payment_reference",
        "currency",
        "cutoff_ms"
      ],
      "properties": {
        "idempotency_key": {
          "type": "string",
          "format": "uuid"
        },
        "payment_reference": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200,
          "description": "Nonblank reference, at most 200 UTF-8 bytes, no control characters. Preserve the exact value on retry."
        },
        "currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$",
          "description": "One currency without conversion."
        },
        "from_ms": {
          "type": "integer",
          "format": "int64",
          "minimum": 0,
          "maximum": 253402300799999,
          "description": "Optional inclusive earning creation lower bound. Omit to include all unpaid earnings through the cutoff."
        },
        "cutoff_ms": {
          "type": "integer",
          "format": "int64",
          "minimum": 0,
          "maximum": 253402300799999,
          "description": "Inclusive upper bound on earning creation time, Unix milliseconds."
        }
      }
    }
  ]
}
```

## Responses

### HTTP 200

Recorded or replayed settlement. Period settlement additionally reports amount, entry count and remaining unpaid balance.

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
        },
        "currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$"
        },
        "amount_nanos": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "entry_count": {
          "type": "integer",
          "minimum": 1
        },
        "remaining_unpaid_nanos": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "remaining_entry_count": {
          "type": "integer",
          "minimum": 0
        }
      }
    }
  }
}
```

### HTTP 400

Invalid reference, mixed mode fields, bad currency or cutoff, or amount overflow.

### HTTP 401

Invalid administrative credential.

### HTTP 403

Platform administration required.

### HTTP 409

Provider or earnings unavailable, changed replay, duplicate payment reference, or no unpaid earnings in the period.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Platform administration required; Provider membership does not grant this write. Does not transfer funds or overpay. Send either attempt_ids (legacy request-level selection) or currency plus cutoff_ms (period settlement); from_ms is an optional inclusive lower bound. Period settlement selects every unpaid earning of that Provider and currency created on or before cutoff_ms, computes the exact total and ignores request-level identifiers supplied in that mode. The period response reports the recorded amount, entry count, and unpaid amount remaining in that currency; neither mode returns customer, request, credential or customer-price detail. Reuse the supplied idempotency key with the identical mode, reference and period bounds for retries; entry order is irrelevant. Changed replay, duplicate payment reference, unavailable selection, or a period with no positive unpaid earnings returns 409. No customer balance credit or Provider authorization is created.

**Supported scope:** implemented
