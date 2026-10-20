---
title: "List current platform standard prices"
description: "GET /api/v1/pricing/standard-prices"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/pricing/standard-prices`

Explicit platform administration required; ordinary customer/Provider membership does not grant access. Current selling revisions use one database snapshot, UUID keyset order. Advisory pricing_health compares those schedules with a subsequent current Provider quote snapshot; refresh after edits. Pass next_after unchanged; null means complete. Prices do not establish qualified inventory. No customer usage, credentials or numeric Provider costs; confidential relative cost diagnostics are platform-only. Internal references are API identifiers, never display names. Cache-Control: no-store.

Operation: `listRetailStandards`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/pricing/standard-prices" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### after

Location: **query**. Optional.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 50
}
```

## Request body

No request body is declared.

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
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "price_id": {
            "type": "string",
            "format": "uuid"
          },
          "model_alias": {
            "type": "string"
          },
          "currency": {
            "type": "string"
          },
          "version": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "revision": {
            "type": "string",
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
          "published_at": {
            "type": "string",
            "format": "date-time"
          },
          "pricing_health": {
            "type": "object",
            "description": "Confidential platform-only advisory comparison against current Provider quotes; not admission authorization or a realized margin. Refresh after publication.",
            "required": [
              "advisory",
              "checks"
            ],
            "properties": {
              "advisory": {
                "type": "boolean"
              },
              "checks": {
                "type": "array",
                "items": {
                  "type": "object",
                  "required": [
                    "status",
                    "dimensions"
                  ],
                  "properties": {
                    "route": {
                      "type": [
                        "string",
                        "null"
                      ]
                    },
                    "provider": {
                      "type": [
                        "string",
                        "null"
                      ]
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "below_cost",
                        "missing_provider_price",
                        "comparison_unavailable",
                        "no_lower_unit_rates"
                      ]
                    },
                    "message": {
                      "type": "string"
                    },
                    "dimensions": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "required": [
                          "dimension",
                          "minimum_input_tokens"
                        ],
                        "properties": {
                          "dimension": {
                            "type": "string"
                          },
                          "minimum_input_tokens": {
                            "type": "string"
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "required": [
          "price_id",
          "model_alias",
          "currency",
          "version",
          "revision",
          "schedule",
          "published_at"
        ]
      }
    },
    "next_after": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    }
  },
  "required": [
    "data",
    "next_after"
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

## Behavior and supported scope

Explicit platform administration required; ordinary customer/Provider membership does not grant access. Current selling revisions use one database snapshot, UUID keyset order. Advisory pricing_health compares those schedules with a subsequent current Provider quote snapshot; refresh after edits. Pass next_after unchanged; null means complete. Prices do not establish qualified inventory. No customer usage, credentials or numeric Provider costs; confidential relative cost diagnostics are platform-only. Internal references are API identifiers, never display names. Cache-Control: no-store.

**Supported scope:** implemented
