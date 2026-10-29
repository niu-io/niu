---
title: "Read saved company top-up status"
description: "GET /api/v1/organizations/{organization}/billing/topups/{order}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/billing/topups/{order}`

Organization-wide owner/admin with read access or installation administrator only. Reads durable records without querying the payment service. Paid and closed orders withhold checkout URLs. Internal routing references must not become product labels. No merchant, platform receipt, ledger identity, Provider cost or margin is returned. Storage reads use transaction-local 250 ms lock and 2 s statement limits; pool admission and the complete HTTP deadline are separate. Timeout returns sanitized 503, never empty or partial success.

Operation: `getCustomerTopup`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/topups/{order}" \
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

### order

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Saved top-up status; checkout and pending status confer no spending capacity

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
        "currency",
        "amount_nanos",
        "payment_method",
        "status",
        "checkout_url"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid",
          "description": "Internal API routing reference; never display as a product label."
        },
        "currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$",
          "description": "Immutable saved account currency; no implicit conversion."
        },
        "amount_nanos": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "payment_method": {
          "type": "string"
        },
        "status": {
          "type": "string",
          "enum": [
            "reconciliation_required",
            "pending",
            "paid",
            "closed"
          ]
        },
        "checkout_url": {
          "type": [
            "string",
            "null"
          ],
          "format": "uri",
          "description": "Validated HTTPS checkout for pending orders only; null for paid and closed orders."
        },
        "credits": {
          "type": [
            "object",
            "null"
          ],
          "additionalProperties": false,
          "required": [
            "credit_atoms",
            "definition_revision",
            "rule_revision",
            "name",
            "display_precision",
            "atoms_per_unit"
          ],
          "properties": {
            "credit_atoms": {
              "type": "string",
              "pattern": "^[1-9][0-9]*$"
            },
            "definition_revision": {
              "type": "string",
              "pattern": "^[1-9][0-9]*$"
            },
            "rule_revision": {
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
            }
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid route identifier

### HTTP 401

Authentication required

### HTTP 404

Order missing or company billing access not granted

### HTTP 503

Durable storage unavailable

## Behavior and supported scope

Organization-wide owner/admin with read access or installation administrator only. Reads durable records without querying the payment service. Paid and closed orders withhold checkout URLs. Internal routing references must not become product labels. No merchant, platform receipt, ledger identity, Provider cost or margin is returned. Storage reads use transaction-local 250 ms lock and 2 s statement limits; pool admission and the complete HTTP deadline are separate. Timeout returns sanitized 503, never empty or partial success.

**Supported scope:** implemented
