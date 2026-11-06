---
title: "Preview an unpaid Provider balance through a cutoff"
description: "GET /api/v1/providers/{provider}/settlements/preview"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/providers/{provider}/settlements/preview`

Platform administration required. Read-only: creates no earning, payment, settlement entry or audit event and transfers no funds. Selects every unpaid earning of this Provider and currency created on or before cutoff_ms, optionally bounded below by from_ms (inclusive). Returns only aggregate count and exact amount plus the unpaid amount and count that would remain in that currency; never returns request IDs, customer, workspace, credential or customer-price detail. The write endpoint independently revalidates the same unpaid rows.

Operation: `previewProviderPeriodSettlement`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/providers/{provider}/settlements/preview" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  --url-query 'currency=<CURRENCY>' \
  --url-query 'cutoff_ms=<CUTOFF_MS>'
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

### currency

Location: **query**. **Required.** One currency without conversion.

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
}
```

### from_ms

Location: **query**. Optional. Inclusive earning creation lower bound. Omit for all unpaid earnings through the cutoff.

```json
{
  "type": "integer",
  "format": "int64",
  "minimum": 0,
  "maximum": 253402300799999
}
```

### cutoff_ms

Location: **query**. **Required.** Inclusive earning creation cutoff, Unix milliseconds.

```json
{
  "type": "integer",
  "format": "int64",
  "minimum": 0,
  "maximum": 253402300799999
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Aggregate unpaid selection and remaining balance.

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
        "currency",
        "from_ms",
        "cutoff_ms",
        "entry_count",
        "amount_nanos",
        "remaining_unpaid_nanos",
        "remaining_entry_count"
      ],
      "properties": {
        "currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$"
        },
        "from_ms": {
          "type": [
            "integer",
            "null"
          ]
        },
        "cutoff_ms": {
          "type": "integer"
        },
        "entry_count": {
          "type": "integer",
          "minimum": 0
        },
        "amount_nanos": {
          "type": "string",
          "pattern": "^[0-9]+$"
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

Invalid currency, cutoff or period range.

### HTTP 401

Invalid administrative credential.

### HTTP 403

Platform administration required.

### HTTP 404

Provider not found or deleted.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Platform administration required. Read-only: creates no earning, payment, settlement entry or audit event and transfers no funds. Selects every unpaid earning of this Provider and currency created on or before cutoff_ms, optionally bounded below by from_ms (inclusive). Returns only aggregate count and exact amount plus the unpaid amount and count that would remain in that currency; never returns request IDs, customer, workspace, credential or customer-price detail. The write endpoint independently revalidates the same unpaid rows.

**Supported scope:** implemented
