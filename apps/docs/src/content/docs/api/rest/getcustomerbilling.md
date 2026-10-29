---
title: "Read workspace customer charges, tariffs and latest 100 invoices"
description: "GET /api/v1/organizations/{organization}/projects/{project}/billing"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/billing`

Requires workspace read access. Balances cover the full ledger per currency. Tariffs are current effective customer selling prices using the same workspace/standard enrollment and customer/global promotion selection as model discovery, within the billing read snapshot. Enabled personally funded routes are excluded. Rates are informational and do not establish route availability or spending authorization. All monetary amounts and aggregate counts are decimal integer strings. Upstream costs are separate. Cache-Control is no-store.

Operation: `getCustomerBilling`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/billing" \
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

### project

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

Billing overview

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
      "required": [
        "balances",
        "unresolved",
        "unpriced",
        "tariffs",
        "invoices"
      ],
      "properties": {
        "balances": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "currency",
              "charged_nanos",
              "unbilled_nanos",
              "due_nanos",
              "paid_nanos"
            ],
            "properties": {
              "currency": {
                "type": "string"
              },
              "charged_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "unbilled_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "due_nanos": {
                "allOf": [
                  {
                    "type": "string",
                    "pattern": "^[0-9]+$"
                  }
                ],
                "description": "Invoiced charges without an invoice receipt or matching balance debit."
              },
              "paid_nanos": {
                "allOf": [
                  {
                    "type": "string",
                    "pattern": "^[0-9]+$"
                  }
                ],
                "description": "Charges settled by a balance debit or invoice receipt, counted once, including balance debits before invoicing."
              }
            }
          }
        },
        "unresolved": {
          "allOf": [
            {
              "type": "string",
              "pattern": "^[0-9]+$"
            }
          ],
          "description": "Dispatched non-personal requests with a text or media price binding but no corresponding charge; excludes confirmed nonexecution."
        },
        "unpriced": {
          "allOf": [
            {
              "type": "string",
              "pattern": "^[0-9]+$"
            }
          ],
          "description": "Dispatched non-personal requests without either a text or media price binding; excludes confirmed nonexecution."
        },
        "tariffs": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "model_alias",
              "revision",
              "currency",
              "prompt_rate",
              "completion_rate"
            ],
            "properties": {
              "model_alias": {
                "type": "string"
              },
              "revision": {
                "type": "string",
                "format": "uuid"
              },
              "currency": {
                "type": "string"
              },
              "prompt_rate": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "completion_rate": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "minimum_charge_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$",
                "description": "Minimum customer charge in currency nanounits (0 to 9223372036854775807), not a token rate. Defaults to zero for new tariffs. Replacing a nonzero minimum requires an explicit value; zero disables it. Known completed usage is charged the greater of the rounded token amount plus request_fee_nanos and this minimum. Unknown usage remains unresolved."
              },
              "cached_prompt_rate": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^[0-9]+$"
              },
              "request_fee_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$",
                "description": "Customer-only fixed fee in currency nanounits (0 to 9223372036854775807). Charge = max(rounded token charge + request fee, minimum charge) for known completed usage. Unknown execution/usage and confirmed rejection do not create a fee. Defaults to zero on new tariffs; replacement of a nonzero fee requires an explicit value; zero disables it."
              },
              "reasoning_completion_rate": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^[0-9]+$",
                "description": "Reported reasoning output is a subset of total completion tokens. A configured rate prices that subset separately; missing quantity remains unresolved."
              },
              "cache_write_prompt_rate": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^[0-9]+$",
                "description": "Reported cache-write input is a disjoint subset of aggregate input. A configured rate prices it separately; missing quantity remains unresolved."
              },
              "context_tiers": {
                "type": "array",
                "maxItems": 32,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "minimum_input_tokens",
                    "prompt_rate",
                    "completion_rate"
                  ],
                  "properties": {
                    "minimum_input_tokens": {
                      "type": "string",
                      "pattern": "^[0-9]+$",
                      "description": "Positive inclusive aggregate input threshold, at most 9223372036854775807."
                    },
                    "prompt_rate": {
                      "type": "string",
                      "pattern": "^[0-9]+$",
                      "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
                    },
                    "completion_rate": {
                      "type": "string",
                      "pattern": "^[0-9]+$",
                      "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
                    },
                    "cached_prompt_rate": {
                      "type": [
                        "string",
                        "null"
                      ],
                      "pattern": "^[0-9]+$",
                      "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
                    },
                    "cache_write_prompt_rate": {
                      "type": [
                        "string",
                        "null"
                      ],
                      "pattern": "^[0-9]+$",
                      "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
                    },
                    "reasoning_completion_rate": {
                      "type": [
                        "string",
                        "null"
                      ],
                      "pattern": "^[0-9]+$",
                      "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
                    }
                  }
                },
                "description": "Complete whole-request schedules; highest inclusive input threshold wins. Null category rates do not inherit the base schedule. Empty array clears tiers; omitting existing tiers conflicts."
              },
              "discount_baseline_revision": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "uuid",
                "description": "Original selling-price revision for an explicit discount. API reference only; never a UI label. Resulting rates, currency, category presence and context thresholds are checked against the original. Existing requests retain their pinned revision."
              },
              "pricing_source": {
                "type": "string",
                "enum": [
                  "workspace",
                  "platform"
                ]
              },
              "promotion_scope": {
                "type": [
                  "string",
                  "null"
                ],
                "enum": [
                  "customer",
                  "global",
                  null
                ]
              },
              "price_version": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "selected_at": {
                "type": "string",
                "pattern": "^[0-9]+$",
                "description": "Selection cutoff as Unix seconds; informational, not a pinned request quote."
              }
            }
          }
        },
        "invoices": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "id",
              "from_ms",
              "to_ms",
              "currency",
              "amount_nanos",
              "created_at",
              "status",
              "payment_reference"
            ],
            "properties": {
              "id": {
                "type": "string",
                "format": "uuid"
              },
              "from_ms": {
                "type": "integer",
                "format": "int64"
              },
              "to_ms": {
                "type": "integer",
                "format": "int64"
              },
              "currency": {
                "type": "string"
              },
              "amount_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "created_at": {
                "type": "string",
                "format": "date-time"
              },
              "status": {
                "type": "string",
                "enum": [
                  "issued",
                  "paid"
                ],
                "description": "Paid when an invoice receipt exists or every included charge is settled by a matching balance debit or has zero value. Credit-backed account debt remains separate."
              },
              "payment_reference": {
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

### HTTP 401

Invalid or expired credential

### HTTP 404

Workspace outside authorized scope

## Behavior and supported scope

Requires workspace read access. Balances cover the full ledger per currency. Tariffs are current effective customer selling prices using the same workspace/standard enrollment and customer/global promotion selection as model discovery, within the billing read snapshot. Enabled personally funded routes are excluded. Rates are informational and do not establish route availability or spending authorization. All monetary amounts and aggregate counts are decimal integer strings. Upstream costs are separate. Cache-Control is no-store.

**Supported scope:** implemented
