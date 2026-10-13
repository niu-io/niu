---
title: "Read invoice lines grouped by model and pinned rate revision"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/billing/invoices/{invoice}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/billing/invoices/{invoice}`

Requires workspace read access and an existing invoice in that workspace. Unknown or out-of-scope invoice IDs return 404. Text quantities and rates are pinned to the charge revision; publishing a new tariff does not reprice historical invoice lines. Empty text or media arrays describe an existing invoice with no entries of that kind. Supplier expenses are never included. Cache-Control no-store.

Operation: `getCustomerInvoiceLines`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/billing/invoices/{invoice}" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
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

### invoice

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### media_after

Location: **query**. Optional. Opaque media_next_cursor from the preceding page. Text groups repeat on each page.

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

Grouped immutable charge entries

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "media_lines",
    "media_next_cursor"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "allOf": [
          {
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
              }
            }
          },
          {
            "type": "object",
            "required": [
              "requests",
              "prompt_tokens",
              "completion_tokens",
              "amount_nanos"
            ],
            "properties": {
              "requests": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "prompt_tokens": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "completion_tokens": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "cached_prompt_tokens": {
                "type": [
                  "string",
                  "null"
                ],
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
              "amount_nanos": {
                "type": "string",
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
              "reasoning_completion_tokens": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^[0-9]+$",
                "description": "Reported reasoning subset priced separately; null for a flat output tariff."
              },
              "cache_write_prompt_rate": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^[0-9]+$",
                "description": "Reported cache-write input is a disjoint subset of aggregate input. A configured rate prices it separately; missing quantity remains unresolved."
              },
              "cache_write_prompt_tokens": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^[0-9]+$",
                "description": "Separately priced reported cache-write tokens; null when this category has no separate rate."
              },
              "context_minimum_input_tokens": {
                "type": [
                  "string",
                  "null"
                ],
                "description": "Pinned inclusive input threshold; null means the base schedule."
              }
            }
          }
        ]
      }
    },
    "media_next_cursor": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid",
      "description": "Pass as media_after for the next page; null when exhausted."
    },
    "media_lines": {
      "type": "array",
      "maxItems": 100,
      "description": "Per-request customer media receipts. Text groups remain in data; both arrays contribute to the invoice total.",
      "items": {
        "type": "object",
        "required": [
          "model_alias",
          "currency",
          "amount_nanos",
          "tariff_revision",
          "meter",
          "measured_quantity",
          "billable_quantity",
          "discount_revisions",
          "bound_exceeded"
        ],
        "properties": {
          "model_alias": {
            "type": "string"
          },
          "currency": {
            "type": "string"
          },
          "amount_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "tariff_revision": {
            "type": "string"
          },
          "meter": {
            "type": "string"
          },
          "measured_quantity": {
            "type": "object",
            "required": [
              "numerator",
              "denominator"
            ],
            "properties": {
              "numerator": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "denominator": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              }
            }
          },
          "billable_quantity": {
            "type": "object",
            "required": [
              "numerator",
              "denominator"
            ],
            "properties": {
              "numerator": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "denominator": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              }
            }
          },
          "discount_revisions": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "bound_exceeded": {
            "type": "boolean"
          }
        }
      }
    }
  }
}
```

### HTTP 401

Invalid or expired administrative credential.

### HTTP 404

Invoice not found in the authorized workspace.

## Behavior and supported scope

Requires workspace read access and an existing invoice in that workspace. Unknown or out-of-scope invoice IDs return 404. Text quantities and rates are pinned to the charge revision; publishing a new tariff does not reprice historical invoice lines. Empty text or media arrays describe an existing invoice with no entries of that kind. Supplier expenses are never included. Cache-Control no-store.

**Supported scope:** implemented
