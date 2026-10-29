---
title: "Issue noncash Credits with an immutable provenance and expiry"
description: "POST /api/v1/organizations/{organization}/billing/units/grants"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/billing/units/grants`

Platform administration required. New issuance requires active Credits mode and the current unit definition. Promotional and simulated grants have zero monetary backing and create neither a payment receipt nor a monetary balance entry. Provide a customer-appropriate reason. Expiry is optional and must be in the future when new issuance commits. Reusing an idempotency key with the same semantic input returns the original grant without extending expiry, even after expiry or later unit publications. Different input conflicts. The returned amount is original issuance, not current spendable capacity. Purchased provenance is reserved for independently verified payments. Operator authority is rechecked under a transaction lock.

Operation: `issueCustomerUnitGrant`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/units/grants" \
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
    "definition_revision",
    "credit_atoms",
    "provenance",
    "reason",
    "idempotency_key"
  ],
  "properties": {
    "definition_revision": {
      "type": "string",
      "pattern": "^[1-9][0-9]{0,18}$",
      "description": "Exact positive decimal integer, at most 9223372036854775807."
    },
    "credit_atoms": {
      "type": "string",
      "pattern": "^[1-9][0-9]{0,18}$",
      "description": "Exact positive decimal integer, at most 9223372036854775807."
    },
    "provenance": {
      "type": "string",
      "enum": [
        "promotional",
        "simulated"
      ]
    },
    "reason": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500
    },
    "expires_at_ms": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[1-9][0-9]{0,14}$",
      "description": "Optional future Unix milliseconds, at most 253402300799000. Null means no expiry."
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

Original immutable grant

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
        "definition_revision",
        "credit_atoms",
        "provenance",
        "reason",
        "expires_at_ms",
        "id",
        "name",
        "display_precision",
        "atoms_per_unit",
        "created_at"
      ],
      "properties": {
        "definition_revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]{0,18}$",
          "description": "Exact positive decimal integer, at most 9223372036854775807."
        },
        "credit_atoms": {
          "type": "string",
          "pattern": "^[1-9][0-9]{0,18}$",
          "description": "Exact positive decimal integer, at most 9223372036854775807."
        },
        "provenance": {
          "type": "string",
          "enum": [
            "promotional",
            "simulated"
          ]
        },
        "reason": {
          "type": "string",
          "minLength": 1,
          "maxLength": 500
        },
        "expires_at_ms": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[1-9][0-9]{0,14}$",
          "description": "Optional future Unix milliseconds, at most 253402300799000. Null means no expiry."
        },
        "id": {
          "type": "string",
          "format": "uuid"
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
        }
      }
    }
  }
}
```

### HTTP 400

Invalid unit, quantity, provenance, reason or expiry

### HTTP 401

Authentication unavailable or revoked

### HTTP 403

Platform administration required

### HTTP 409

Credits mode inactive, stale definition, missing company or conflicting idempotency input

### HTTP 422

Malformed request

### HTTP 503

Storage unavailable

## Behavior and supported scope

Platform administration required. New issuance requires active Credits mode and the current unit definition. Promotional and simulated grants have zero monetary backing and create neither a payment receipt nor a monetary balance entry. Provide a customer-appropriate reason. Expiry is optional and must be in the future when new issuance commits. Reusing an idempotency key with the same semantic input returns the original grant without extending expiry, even after expiry or later unit publications. Different input conflicts. The returned amount is original issuance, not current spendable capacity. Purchased provenance is reserved for independently verified payments. Operator authority is rechecked under a transaction lock.

**Supported scope:** implemented
