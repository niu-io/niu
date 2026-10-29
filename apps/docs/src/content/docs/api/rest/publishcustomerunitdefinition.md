---
title: "Publish an immutable consumption-unit definition"
description: "POST /api/v1/platform/units/definitions"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/platform/units/definitions`

Requires platform administration. Configuration publication alone does not activate Credits billing, convert monetary balances, issue units or change consumption tariffs. Revisions and conversion components use exact decimal strings. Writes serialize on the installation configuration revision. Identical idempotent retries return the original publication even after later changes; different input with the same key conflicts. Purchase rules are reduced exact positive ratios and must reference the latest unit definition. Publishing a new definition requires explicit purchase-rule publication for new purchases; historical rules are retained. No procurement data is returned.

Operation: `publishCustomerUnitDefinition`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/platform/units/definitions" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

No path, query, or header parameters are declared.

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "name",
    "display_precision",
    "expected_revision",
    "idempotency_key"
  ],
  "properties": {
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
    "expected_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,18})$",
      "description": "Canonical nonnegative decimal integer, at most 9223372036854775807."
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
