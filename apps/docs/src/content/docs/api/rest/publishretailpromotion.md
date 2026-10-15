---
title: "Publish one finite global or customer price"
description: "POST /api/v1/pricing/standard-prices/{price}/promotions"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/pricing/standard-prices/{price}/promotions`

Explicit platform administration required; ordinary customer/Provider membership does not grant access. The explicit result references an exact immutable undiscounted standard revision of this price identity. Null customer_organization_id means global; a company reference means customer-specific. Inclusive start/exclusive end are exact UTC epoch-second strings, with finite end greater than start. Same-scope overlap is rejected; at selection an eligible customer rule overrides the global rule, never stacks. Every text category/fixed charge/context tier must preserve meaning and not increase; media retains dimensions, meter, unit, decimal scale, rounding and minimum and only discounts amount_units. Retained original baselines survive later standard updates. No existing request or job is repriced.

Operation: `publishRetailPromotion`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/pricing/standard-prices/{price}/promotions" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### price

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
  "properties": {
    "baseline_revision": {
      "type": "string",
      "format": "uuid"
    },
    "customer_organization_id": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    },
    "schedule": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "kind": {
              "type": "string",
              "const": "text"
            },
            "prompt_rate": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "completion_rate": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "cached_prompt_rate": {
              "type": [
                "string",
                "null"
              ],
              "pattern": "^[0-9]+$"
            },
            "cache_write_prompt_rate": {
              "type": [
                "string",
                "null"
              ],
              "pattern": "^[0-9]+$"
            },
            "reasoning_completion_rate": {
              "type": [
                "string",
                "null"
              ],
              "pattern": "^[0-9]+$"
            },
            "minimum_charge_nanos": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "request_fee_nanos": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "context_tiers": {
              "type": "array",
              "maxItems": 32,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "minimum_input_tokens": {
                    "type": "string",
                    "pattern": "^[0-9]+$"
                  },
                  "prompt_rate": {
                    "type": "string",
                    "pattern": "^[0-9]+$"
                  },
                  "completion_rate": {
                    "type": "string",
                    "pattern": "^[0-9]+$"
                  },
                  "cached_prompt_rate": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^[0-9]+$"
                  },
                  "cache_write_prompt_rate": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^[0-9]+$"
                  },
                  "reasoning_completion_rate": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^[0-9]+$"
                  }
                },
                "required": [
                  "minimum_input_tokens",
                  "prompt_rate",
                  "completion_rate",
                  "cached_prompt_rate",
                  "cache_write_prompt_rate",
                  "reasoning_completion_rate"
                ]
              }
            }
          },
          "required": [
            "kind",
            "prompt_rate",
            "completion_rate",
            "cached_prompt_rate",
            "cache_write_prompt_rate",
            "reasoning_completion_rate",
            "minimum_charge_nanos",
            "request_fee_nanos",
            "context_tiers"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "kind": {
              "type": "string",
              "const": "media"
            },
            "dimensions": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "model": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 200
                },
                "channel": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 256
                },
                "resolution": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 256
                },
                "reference_video": {
                  "type": "boolean"
                }
              },
              "required": [
                "model",
                "channel",
                "resolution",
                "reference_video"
              ]
            },
            "meter": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "decimal_places": {
              "type": "integer",
              "minimum": 0,
              "maximum": 9
            },
            "amount_units": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "per_quantity": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "numerator": {
                  "type": "string",
                  "pattern": "^[0-9]+$"
                },
                "denominator": {
                  "type": "string",
                  "pattern": "^[0-9]+$"
                }
              },
              "required": [
                "numerator",
                "denominator"
              ]
            },
            "minimum_quantity": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "numerator": {
                  "type": "string",
                  "pattern": "^[0-9]+$"
                },
                "denominator": {
                  "type": "string",
                  "pattern": "^[0-9]+$"
                }
              },
              "required": [
                "numerator",
                "denominator"
              ]
            },
            "rounding": {
              "type": "string",
              "enum": [
                "Down",
                "Up",
                "HalfEven"
              ]
            }
          },
          "required": [
            "kind",
            "dimensions",
            "meter",
            "decimal_places",
            "amount_units",
            "per_quantity",
            "minimum_quantity",
            "rounding"
          ]
        }
      ],
      "description": "Concrete resulting selling price; exact decimal strings, no multipliers or Provider purchase terms."
    },
    "effective_from": {
      "type": "string",
      "pattern": "^[0-9]+$"
    },
    "effective_until": {
      "type": "string",
      "pattern": "^[0-9]+$"
    },
    "expected_version": {
      "type": "string",
      "pattern": "^[0-9]+$"
    },
    "idempotency_key": {
      "type": "string",
      "format": "uuid"
    },
    "reason": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500
    }
  },
  "required": [
    "baseline_revision",
    "customer_organization_id",
    "schedule",
    "effective_from",
    "effective_until",
    "expected_version",
    "idempotency_key",
    "reason"
  ]
}
```

## Responses

### HTTP 200

Current configuration or exact prior committed publication

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "data": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "price_id": {
          "type": "string",
          "format": "uuid"
        },
        "revision": {
          "type": "string",
          "format": "uuid"
        },
        "version": {
          "type": "string",
          "pattern": "^[0-9]+$"
        }
      },
      "required": [
        "price_id",
        "revision",
        "version"
      ]
    }
  },
  "required": [
    "data"
  ]
}
```

### HTTP 400

Invalid exact amount, schedule, period or pagination

### HTTP 401

Authentication required

### HTTP 403

Explicit platform administration required

### HTTP 409

Stale version, conflicting key/period, unknown identity/customer or unsupported publication

### HTTP 422

Malformed JSON or unsupported schedule shape

## Behavior and supported scope

Explicit platform administration required; ordinary customer/Provider membership does not grant access. The explicit result references an exact immutable undiscounted standard revision of this price identity. Null customer_organization_id means global; a company reference means customer-specific. Inclusive start/exclusive end are exact UTC epoch-second strings, with finite end greater than start. Same-scope overlap is rejected; at selection an eligible customer rule overrides the global rule, never stacks. Every text category/fixed charge/context tier must preserve meaning and not increase; media retains dimensions, meter, unit, decimal scale, rounding and minimum and only discounts amount_units. Retained original baselines survive later standard updates. No existing request or job is repriced.

**Supported scope:** implemented
