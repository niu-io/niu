---
title: "Prepare an exact versioned Credits purchase quote"
description: "POST /api/v1/organizations/{organization}/billing/quotes"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/billing/quotes`

Platform administration required. A saved preview does not activate Credits, issue units, create a payment or prove processor amount eligibility. New quotes require the latest rule for its payment currency and latest definition. Inexact conversions and overflow are rejected. The quote pins amount, rule and unit definition for fifteen minutes. Identical idempotent retries retain the original quote and expiry even after rule changes or expiry; checkout must separately enforce validity. Reading historical quotes does not revalue them. No procurement data is returned.

Operation: `prepareCustomerUnitQuote`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/quotes" \
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "rule_revision",
    "payment_nanos",
    "idempotency_key"
  ],
  "properties": {
    "rule_revision": {
      "type": "string",
      "pattern": "^[1-9][0-9]{0,18}$",
      "description": "Exact positive integer at most 9223372036854775807."
    },
    "payment_nanos": {
      "type": "string",
      "pattern": "^[1-9][0-9]{0,18}$",
      "description": "Exact positive integer at most 9223372036854775807."
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

Original immutable quote

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
        "rule_revision",
        "definition_revision",
        "payment_nanos",
        "credit_atoms",
        "numerator",
        "denominator",
        "id",
        "payment_currency",
        "name",
        "display_precision",
        "atoms_per_unit",
        "created_at",
        "expires_at"
      ],
      "properties": {
        "rule_revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]{0,18}$",
          "description": "Exact positive integer at most 9223372036854775807."
        },
        "definition_revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]{0,18}$",
          "description": "Exact positive integer at most 9223372036854775807."
        },
        "payment_nanos": {
          "type": "string",
          "pattern": "^[1-9][0-9]{0,18}$",
          "description": "Exact positive integer at most 9223372036854775807."
        },
        "credit_atoms": {
          "type": "string",
          "pattern": "^[1-9][0-9]{0,18}$",
          "description": "Exact positive integer at most 9223372036854775807."
        },
        "numerator": {
          "type": "string",
          "pattern": "^[1-9][0-9]{0,18}$",
          "description": "Exact positive integer at most 9223372036854775807."
        },
        "denominator": {
          "type": "string",
          "pattern": "^[1-9][0-9]{0,18}$",
          "description": "Exact positive integer at most 9223372036854775807."
        },
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "payment_currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$"
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
        "created_at": {
          "type": "string",
          "format": "date-time"
        },
        "expires_at": {
          "type": "string",
          "format": "date-time"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid amount, inexact conversion or overflow

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 404

Quote not found in the requested organization

### HTTP 409

Stale rule, missing organization or conflicting idempotency input

### HTTP 422

Malformed request body

### HTTP 503

Storage unavailable

## Behavior and supported scope

Platform administration required. A saved preview does not activate Credits, issue units, create a payment or prove processor amount eligibility. New quotes require the latest rule for its payment currency and latest definition. Inexact conversions and overflow are rejected. The quote pins amount, rule and unit definition for fifteen minutes. Identical idempotent retries retain the original quote and expiry even after rule changes or expiry; checkout must separately enforce validity. Reading historical quotes does not revalue them. No procurement data is returned.

**Supported scope:** implemented
