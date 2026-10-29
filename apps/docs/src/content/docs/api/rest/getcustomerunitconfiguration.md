---
title: "Read branded-unit configuration"
description: "GET /api/v1/platform/units"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/platform/units`

Requires platform administration. Configuration publication alone does not activate Credits billing, convert monetary balances, issue units or change consumption tariffs. Revisions and conversion components use exact decimal strings. Writes serialize on the installation configuration revision. Identical idempotent retries return the original publication even after later changes; different input with the same key conflicts. Purchase rules are reduced exact positive ratios and must reference the latest unit definition. Publishing a new definition requires explicit purchase-rule publication for new purchases; historical rules are retained. No procurement data is returned.

Operation: `getCustomerUnitConfiguration`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/platform/units" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Saved configuration or original idempotent publication

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
        "revision",
        "definition",
        "purchase_rules",
        "text_tariffs",
        "billing_mode"
      ],
      "properties": {
        "revision": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]{0,18})$",
          "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
        },
        "definition": {
          "oneOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "revision",
                "name",
                "display_precision",
                "atoms_per_unit"
              ],
              "properties": {
                "revision": {
                  "type": "string",
                  "pattern": "^[1-9][0-9]{0,18}$",
                  "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
                },
                "name": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 80
                },
                "display_precision": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 9
                },
                "atoms_per_unit": {
                  "type": "string",
                  "const": "1000000000"
                }
              }
            },
            {
              "type": "null"
            }
          ]
        },
        "purchase_rules": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "revision",
              "definition_revision",
              "payment_currency",
              "numerator",
              "denominator"
            ],
            "properties": {
              "revision": {
                "type": "string",
                "pattern": "^[1-9][0-9]{0,18}$",
                "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
              },
              "definition_revision": {
                "type": "string",
                "pattern": "^[1-9][0-9]{0,18}$",
                "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
              },
              "payment_currency": {
                "type": "string",
                "pattern": "^[A-Z]{3}$"
              },
              "numerator": {
                "type": "string",
                "pattern": "^[1-9][0-9]{0,18}$",
                "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
              },
              "denominator": {
                "type": "string",
                "pattern": "^[1-9][0-9]{0,18}$",
                "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
              }
            }
          }
        },
        "text_tariffs": {
          "type": "array",
          "items": {
            "type": "object"
          }
        },
        "billing_mode": {
          "type": "string",
          "enum": [
            "currency",
            "credits"
          ]
        }
      }
    }
  }
}
```

### HTTP 400

Invalid exact integer or configuration

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 409

Stale revision or conflicting idempotency input

### HTTP 422

Malformed request body

### HTTP 503

Storage unavailable

## Behavior and supported scope

Requires platform administration. Configuration publication alone does not activate Credits billing, convert monetary balances, issue units or change consumption tariffs. Revisions and conversion components use exact decimal strings. Writes serialize on the installation configuration revision. Identical idempotent retries return the original publication even after later changes; different input with the same key conflicts. Purchase rules are reduced exact positive ratios and must reference the latest unit definition. Publishing a new definition requires explicit purchase-rule publication for new purchases; historical rules are retained. No procurement data is returned.

**Supported scope:** implemented
