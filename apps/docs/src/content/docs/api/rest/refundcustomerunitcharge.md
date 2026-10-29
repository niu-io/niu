---
title: "Restore original consumed Credits ranges"
description: "POST /api/v1/organizations/{organization}/billing/units/charges/{attempt}/refunds"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/billing/units/charges/{attempt}/refunds`

Platform administration required. Restores the next unrefunded prefix of an original resolved charge. Original source, definition and expiry remain unchanged; expired restored units stay expired. Purchase conversion and current tariffs are never used. Identical idempotent replay returns the original immutable receipt; conflicting replay and cumulative over-refund are rejected. Concurrent refunds serialize on the unit account. This does not execute an external payment refund, reverse a purchase, or release an unresolved inference hold. No monetary backing or procurement information is returned. Quantities are exact decimal strings.

Operation: `refundCustomerUnitCharge`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/units/charges/{attempt}/refunds" \
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

### attempt

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

Original immutable refund receipt

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
        "id",
        "credit_atoms",
        "reason",
        "atoms_per_unit",
        "created_at",
        "sources"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "credit_atoms": {
          "type": "string"
        },
        "reason": {
          "type": "string"
        },
        "atoms_per_unit": {
          "type": "string",
          "const": "1000000000"
        },
        "created_at": {
          "type": "string",
          "format": "date-time"
        },
        "sources": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "credit_atoms",
              "definition_revision",
              "name",
              "display_precision",
              "provenance",
              "expires_at_ms"
            ],
            "properties": {
              "credit_atoms": {
                "type": "string"
              },
              "definition_revision": {
                "type": "string"
              },
              "name": {
                "type": "string"
              },
              "display_precision": {
                "type": "integer"
              },
              "provenance": {
                "type": "string",
                "enum": [
                  "purchased",
                  "promotional",
                  "simulated"
                ]
              },
              "expires_at_ms": {
                "type": [
                  "string",
                  "null"
                ]
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

Invalid exact quantity or reason

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 404

No Credits reservation in the specified organization

### HTTP 409

Unresolved or released charge, over-refund or conflicting retry

### HTTP 422

Malformed request

### HTTP 503

Storage unavailable

## Behavior and supported scope

Platform administration required. Restores the next unrefunded prefix of an original resolved charge. Original source, definition and expiry remain unchanged; expired restored units stay expired. Purchase conversion and current tariffs are never used. Identical idempotent replay returns the original immutable receipt; conflicting replay and cumulative over-refund are rejected. Concurrent refunds serialize on the unit account. This does not execute an external payment refund, reverse a purchase, or release an unresolved inference hold. No monetary backing or procurement information is returned. Quantities are exact decimal strings.

**Supported scope:** implemented
