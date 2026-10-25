---
title: "Recover company checkout history"
description: "GET /api/v1/organizations/{organization}/billing/topups"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/billing/topups`

Organization-wide owner/admin with read access or installation administrator only. Backend-owned history survives browser changes. At most 100 saved intents per page, ordered by descending creation time and internal routing reference. No upstream calls, merchant credentials or procurement data. Paid/closed entries withhold checkout URLs. Traversal is a live view, not a fixed snapshot; refresh to see newly created orders. Internal IDs are routing/cursor references, never product labels. Storage reads use transaction-local 250 ms lock and 2 s statement limits; pool admission and the complete HTTP deadline are separate. Timeout returns sanitized 503, never empty or partial success. Cursor and history rows share one read-only snapshot.

Operation: `listCustomerTopups`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/topups" \
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

### before

Location: **query**. Optional. next_cursor from the previous company page. Foreign or missing cursors return conflict.

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

Saved checkout history page

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_cursor"
  ],
  "properties": {
    "next_cursor": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    },
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "currency",
          "amount_nanos",
          "payment_method",
          "status",
          "checkout_url",
          "created_at"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "description": "Internal routing/cursor reference; never display as a product label."
          },
          "currency": {
            "type": "string",
            "pattern": "^[A-Z]{3}$"
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
            "format": "uri"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
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
}
```

### HTTP 400

Invalid company or cursor syntax

### HTTP 401

Authentication required

### HTTP 404

Company billing access not granted

### HTTP 409

Foreign or missing cursor

### HTTP 503

Durable storage unavailable

## Behavior and supported scope

Organization-wide owner/admin with read access or installation administrator only. Backend-owned history survives browser changes. At most 100 saved intents per page, ordered by descending creation time and internal routing reference. No upstream calls, merchant credentials or procurement data. Paid/closed entries withhold checkout URLs. Traversal is a live view, not a fixed snapshot; refresh to see newly created orders. Internal IDs are routing/cursor references, never product labels. Storage reads use transaction-local 250 ms lock and 2 s statement limits; pool admission and the complete HTTP deadline are separate. Timeout returns sanitized 503, never empty or partial success. Cursor and history rows share one read-only snapshot.

**Supported scope:** implemented
