---
title: "Compare installation commercial Supplier positions"
description: "GET /admin/v1/commercial-position"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/commercial-position`

Explicit platform administrator only. One current database snapshot for a UTC rolling dispatch interval [from, until), 7/30/90 days and a configured currency. Personal owner-funded supply is excluded. Each row is a Supplier, customer-facing model alias and currency; route-pool candidates appear as distinct offers. Customer charges are confirmed retail charges, not external cash receipts. Supplier settlement links record confirmed external payments, not automatic transfers. Null monetary values mean unavailable, never zero. Margin is customer charge minus Supplier earning over matched attempts only, withheld when any potentially executed attempt is unresolved. Cost is separately reported over matched attempts and withheld if any matching cost entry is missing; cost coverage counts are explicit. Empty offers means no quote in the selected currency. No customer identity, request identity, body or credential is returned. Read-only; never changes routing or model. Identifiers are API references and must not become product labels. Cache-Control: no-store.

Operation: `getCommercialPosition`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  },
  {
    "niuApiKeyAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/commercial-position" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

### currency

Location: **query**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
}
```

### days

Location: **query**. Optional.

```json
{
  "type": "integer",
  "enum": [
    7,
    30,
    90
  ],
  "default": 30
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Commercial positions

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "currency",
    "days",
    "from",
    "until",
    "data"
  ],
  "properties": {
    "currency": {
      "type": "string"
    },
    "days": {
      "type": "integer",
      "enum": [
        7,
        30,
        90
      ]
    },
    "from": {
      "type": "string",
      "format": "date-time"
    },
    "until": {
      "type": "string",
      "format": "date-time"
    },
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "supplier_id": {
            "type": "string",
            "format": "uuid"
          },
          "supplier_name": {
            "type": "string"
          },
          "model_alias": {
            "type": "string"
          },
          "currency": {
            "type": "string"
          },
          "offers": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "offer_id": {
                  "type": "string",
                  "format": "uuid"
                },
                "route_alias": {
                  "type": "string"
                },
                "revision": {
                  "type": "string",
                  "format": "uuid"
                },
                "rate_kind": {
                  "type": "string",
                  "enum": [
                    "text",
                    "media"
                  ]
                },
                "prompt_rate": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "completion_rate": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "state": {
                  "type": "string",
                  "enum": [
                    "paused",
                    "unqualified",
                    "qualified"
                  ]
                },
                "media_rates": {
                  "type": "array",
                  "items": {
                    "type": "object"
                  }
                }
              }
            }
          },
          "customer_charge_nanos": {
            "type": [
              "string",
              "null"
            ]
          },
          "earning_nanos": {
            "type": [
              "string",
              "null"
            ]
          },
          "settled_earning_nanos": {
            "type": [
              "string",
              "null"
            ]
          },
          "unsettled_earning_nanos": {
            "type": [
              "string",
              "null"
            ]
          },
          "cost_nanos": {
            "type": [
              "string",
              "null"
            ]
          },
          "margin_nanos": {
            "type": [
              "string",
              "null"
            ]
          },
          "unresolved_attempts": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "matched_attempts": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "cost_known_attempts": {
            "type": "string",
            "pattern": "^[0-9]+$"
          }
        },
        "required": [
          "supplier_id",
          "supplier_name",
          "model_alias",
          "currency",
          "offers",
          "customer_charge_nanos",
          "earning_nanos",
          "settled_earning_nanos",
          "unsettled_earning_nanos",
          "cost_nanos",
          "margin_nanos",
          "unresolved_attempts",
          "matched_attempts",
          "cost_known_attempts"
        ]
      }
    }
  }
}
```

### HTTP 400

Invalid period or unknown currency

### HTTP 401

Invalid credentials

### HTTP 403

Platform administration required

## Behavior and supported scope

Explicit platform administrator only. One current database snapshot for a UTC rolling dispatch interval [from, until), 7/30/90 days and a configured currency. Personal owner-funded supply is excluded. Each row is a Supplier, customer-facing model alias and currency; route-pool candidates appear as distinct offers. Customer charges are confirmed retail charges, not external cash receipts. Supplier settlement links record confirmed external payments, not automatic transfers. Null monetary values mean unavailable, never zero. Margin is customer charge minus Supplier earning over matched attempts only, withheld when any potentially executed attempt is unresolved. Cost is separately reported over matched attempts and withheld if any matching cost entry is missing; cost coverage counts are explicit. Empty offers means no quote in the selected currency. No customer identity, request identity, body or credential is returned. Read-only; never changes routing or model. Identifiers are API references and must not become product labels. Cache-Control: no-store.

**Supported scope:** implemented
