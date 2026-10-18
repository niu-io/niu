---
title: "Compare installation commercial Provider positions"
description: "GET /api/v1/commercial-position"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/commercial-position`

Explicit late-grant applications against a cohort charge reduce net revenue and increase sales allowance without repricing nominal charges or Provider payable. Their refund restoration is included in recorded refund gift allocation once. Explicit platform administrator only. One current database snapshot for a UTC rolling dispatch interval [from, until), 7/30/90 days or explicit calendar bounds, and a configured currency. Personal owner-funded supply is excluded. Each row is a Provider, customer-facing model alias and currency; route-pool candidates appear as distinct offers. Customer charges are confirmed retail charges, not external cash receipts. Provider settlement links record confirmed external payments, not automatic transfers. Null monetary values mean unavailable, never zero. Margin is customer charge minus Provider earning over matched attempts only, withheld when any potentially executed attempt is unresolved. Cost is separately reported over matched attempts and withheld if any matching cost entry is missing; cost coverage counts are explicit. Empty offers means no quote in the selected currency. No customer identity, request identity, body or credential is returned. Read-only; never changes routing or model. Identifiers are API references and must not become product labels. Cache-Control: no-store. Net customer revenue excludes consumed gifts and recorded customer refunds for this dispatch cohort; it is not cash receipts or posting-period income. Missing charge/source coverage leaves the full net revenue unavailable. Gift allowance is a sales allowance, not an operating expense. net_contribution_nanos subtracts matched Provider earnings from net customer revenue, never known upstream expense again. Legacy margin_nanos remains nominal charge minus Provider earnings and must not be labeled income or net profit. Personal funding is excluded independently of current vendor ownership. customer_refunds_nanos records associated balance-credit restorations for the dispatch cohort, not external cash refund transfers. When fully covered, nominal charge minus recorded refunds minus net consumed-gift allowance equals net customer revenue. Each known customer/Provider/cost ledger currency is represented independently, without conversion. known_upstream_cost_subtotal_nanos sums only actual recorded costs in the selected currency, independently of same-currency customer/Provider matching. It is a known partial subtotal, not proof of complete expense coverage; absent records remain null. upstream_cost_recorded_attempts counts these recorded cost entries. Legacy cost_nanos and cost_known_attempts retain their matched-attempt coverage semantics.

Operation: `getCommercialPosition`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/commercial-position" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
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

### from

Location: **query**. Optional.

```json
{
  "type": "string",
  "format": "date-time"
}
```

### until

Location: **query**. Optional.

```json
{
  "type": "string",
  "format": "date-time"
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
      "type": "integer"
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
          "customer_cash_applied_nanos": {
            "type": [
              "string",
              "null"
            ],
            "description": "Verified wallet cash attributed to cohort charges plus repayments minus cash balance restorations. Not posting-period receipts or proof of an external refund transfer. Gifts are excluded."
          },
          "customer_outstanding_credit_nanos": {
            "type": [
              "string",
              "null"
            ],
            "description": "Remaining wallet credit attributed to cohort charges after repayment, gift applications and credit refunds. Not external invoice receivables."
          },
          "cash_source_uncovered_attempts": {
            "type": "string",
            "description": "Charged attempts lacking complete current wallet provenance. Full cash and outstanding credit are withheld for uncovered or unresolved traffic."
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
          },
          "net_customer_revenue_nanos": {
            "type": [
              "string",
              "null"
            ]
          },
          "consumed_gift_allowance_nanos": {
            "type": [
              "string",
              "null"
            ]
          },
          "net_contribution_nanos": {
            "type": [
              "string",
              "null"
            ]
          },
          "revenue_uncovered_attempts": {
            "type": "string"
          },
          "customer_refunds_nanos": {
            "type": [
              "string",
              "null"
            ]
          },
          "known_upstream_cost_subtotal_nanos": {
            "type": [
              "string",
              "null"
            ]
          },
          "upstream_cost_recorded_attempts": {
            "type": "string"
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
          "cost_known_attempts",
          "net_customer_revenue_nanos",
          "consumed_gift_allowance_nanos",
          "net_contribution_nanos",
          "revenue_uncovered_attempts",
          "customer_refunds_nanos",
          "known_upstream_cost_subtotal_nanos",
          "upstream_cost_recorded_attempts"
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

Explicit late-grant applications against a cohort charge reduce net revenue and increase sales allowance without repricing nominal charges or Provider payable. Their refund restoration is included in recorded refund gift allocation once. Explicit platform administrator only. One current database snapshot for a UTC rolling dispatch interval [from, until), 7/30/90 days or explicit calendar bounds, and a configured currency. Personal owner-funded supply is excluded. Each row is a Provider, customer-facing model alias and currency; route-pool candidates appear as distinct offers. Customer charges are confirmed retail charges, not external cash receipts. Provider settlement links record confirmed external payments, not automatic transfers. Null monetary values mean unavailable, never zero. Margin is customer charge minus Provider earning over matched attempts only, withheld when any potentially executed attempt is unresolved. Cost is separately reported over matched attempts and withheld if any matching cost entry is missing; cost coverage counts are explicit. Empty offers means no quote in the selected currency. No customer identity, request identity, body or credential is returned. Read-only; never changes routing or model. Identifiers are API references and must not become product labels. Cache-Control: no-store. Net customer revenue excludes consumed gifts and recorded customer refunds for this dispatch cohort; it is not cash receipts or posting-period income. Missing charge/source coverage leaves the full net revenue unavailable. Gift allowance is a sales allowance, not an operating expense. net_contribution_nanos subtracts matched Provider earnings from net customer revenue, never known upstream expense again. Legacy margin_nanos remains nominal charge minus Provider earnings and must not be labeled income or net profit. Personal funding is excluded independently of current vendor ownership. customer_refunds_nanos records associated balance-credit restorations for the dispatch cohort, not external cash refund transfers. When fully covered, nominal charge minus recorded refunds minus net consumed-gift allowance equals net customer revenue. Each known customer/Provider/cost ledger currency is represented independently, without conversion. known_upstream_cost_subtotal_nanos sums only actual recorded costs in the selected currency, independently of same-currency customer/Provider matching. It is a known partial subtotal, not proof of complete expense coverage; absent records remain null. upstream_cost_recorded_attempts counts these recorded cost entries. Legacy cost_nanos and cost_known_attempts retain their matched-attempt coverage semantics.

**Supported scope:** implemented
