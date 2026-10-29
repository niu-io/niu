---
title: "Inspect open customer balance reservations"
description: "GET /api/v1/organizations/{organization}/billing/reservations"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/billing/reservations`

Organization-wide owner/admin or installation read access required, matching company balance permissions. Newest-first keyset pages observe one statement snapshot; pages do not share a snapshot. Released reservations are omitted, but a released cursor remains usable. Unknown or foreign cursors and currency-mismatched cursors return 409. Exact nanounit strings distinguish the original reservation from outstanding liability, including known media overrun and excluding posted charge debits. This is a read-only diagnostic; states do not prove nonexecution or authorize releasing funds or retrying inference. No Provider prices, upstream endpoints, credentials or payment references are exposed. Names are current display metadata; IDs are internal links only. Cache-Control no-store. missing_usage_categories lists the absent token categories required by the request-bound customer tariff and selected context tier. Null means classification is unavailable (including unknown aggregate usage, incomplete execution or non-text pricing); an empty list means no required category is missing, not that settlement succeeded. Later price publication does not change this diagnostic.

Operation: `listCustomerBalanceReservations`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/reservations" \
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

Location: **query**. Optional.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### currency

Location: **query**. Optional.

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
}
```

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 100
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Open reservations; empty data is not evidence that paid accounting works.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_before"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "attempt_id",
          "workspace_id",
          "api_key_id",
          "workspace_name",
          "model",
          "execution",
          "usage_confidence",
          "api_key_name",
          "currency",
          "reserved_nanos",
          "outstanding_nanos",
          "created_at",
          "observed_at",
          "status",
          "missing_usage_categories"
        ],
        "properties": {
          "attempt_id": {
            "type": "string",
            "format": "uuid",
            "description": "Internal API reference; do not render as a product label."
          },
          "workspace_id": {
            "type": "string",
            "format": "uuid",
            "description": "Internal API reference; do not render as a product label."
          },
          "api_key_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid",
            "description": "Internal API reference; do not render as a product label."
          },
          "workspace_name": {
            "type": "string"
          },
          "model": {
            "type": "string"
          },
          "execution": {
            "type": "string"
          },
          "usage_confidence": {
            "type": "string"
          },
          "api_key_name": {
            "type": [
              "string",
              "null"
            ]
          },
          "currency": {
            "type": "string",
            "pattern": "^[A-Z]{3}$"
          },
          "reserved_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "outstanding_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "observed_at": {
            "type": "string",
            "format": "date-time"
          },
          "status": {
            "type": "string",
            "enum": [
              "preparing",
              "in_progress",
              "execution_unknown",
              "usage_unknown",
              "settlement_pending"
            ]
          },
          "missing_usage_categories": {
            "type": [
              "array",
              "null"
            ],
            "items": {
              "type": "string",
              "enum": [
                "cached_input_tokens",
                "cache_write_input_tokens",
                "reasoning_output_tokens"
              ]
            },
            "description": "Missing required categories under the pinned customer tariff; null when classification is unavailable. Empty does not establish settlement. No prices or private accounting metadata."
          }
        }
      }
    },
    "next_before": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    }
  }
}
```

### HTTP 400

Invalid currency, cursor, limit or query fields.

### HTTP 401

Authentication required.

### HTTP 404

Company balance permission required.

### HTTP 409

Cursor is unknown or does not match the company/currency.

## Behavior and supported scope

Organization-wide owner/admin or installation read access required, matching company balance permissions. Newest-first keyset pages observe one statement snapshot; pages do not share a snapshot. Released reservations are omitted, but a released cursor remains usable. Unknown or foreign cursors and currency-mismatched cursors return 409. Exact nanounit strings distinguish the original reservation from outstanding liability, including known media overrun and excluding posted charge debits. This is a read-only diagnostic; states do not prove nonexecution or authorize releasing funds or retrying inference. No Provider prices, upstream endpoints, credentials or payment references are exposed. Names are current display metadata; IDs are internal links only. Cache-Control no-store. missing_usage_categories lists the absent token categories required by the request-bound customer tariff and selected context tier. Null means classification is unavailable (including unknown aggregate usage, incomplete execution or non-text pricing); an empty list means no required category is missing, not that settlement succeeded. Later price publication does not change this diagnostic.

**Supported scope:** implemented
