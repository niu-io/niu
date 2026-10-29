---
title: "Read workspace media selling-price enrollment"
description: "GET /api/v1/organizations/{organization}/projects/{project}/billing/media-retail-price-enrollment"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/billing/media-retail-price-enrollment`

Exact workspace/media dimensions/meter identity; currency follows the enrolled price. Platform administration is required for changes. Reads require this workspace authority or platform administration and reveal only its own effective selling price. No procurement or other customer promotions are returned. price_id must be explicitly present: null restores legacy media-card selection for future operations. The published media price must exactly match dimensions and meter and have an existing customer currency account. No balance, credit, route, qualification or operation is created. expected_version is zero initially; exact idempotent retries preserve their original outcome, changed reuse and stale versions conflict. Read effective_price is advisory, not a pinned task price or dispatch qualification. UTC epoch times and amounts are exact strings. Cache-Control: no-store for reads. Video admission reselects at a shared database time and atomically pins customer/Provider prices, independently qualified quantity, provenance and funds. Enrolling a price alone does not enable generation; exact current qualified supply and a supported route remain required. Existing task prices are not reselected after admission.

Operation: `getRetailMediaEnrollment`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/billing/media-retail-price-enrollment" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  --url-query 'model=<MODEL>' \
  --url-query 'channel=<CHANNEL>' \
  --url-query 'resolution=<RESOLUTION>' \
  --url-query 'reference_video=<REFERENCE_VIDEO>' \
  --url-query 'meter=<METER>'
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

### model

Location: **query**. **Required.**

```json
{
  "type": "string"
}
```

### channel

Location: **query**. **Required.**

```json
{
  "type": "string"
}
```

### resolution

Location: **query**. **Required.**

```json
{
  "type": "string"
}
```

### reference_video

Location: **query**. **Required.**

```json
{
  "type": "boolean"
}
```

### meter

Location: **query**. **Required.**

```json
{
  "type": "string"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Committed configuration or own advisory read

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
        "dimensions": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "model": {
              "type": "string"
            },
            "channel": {
              "type": "string"
            },
            "resolution": {
              "type": "string"
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
          "type": "string"
        },
        "price_id": {
          "type": [
            "string",
            "null"
          ],
          "format": "uuid"
        },
        "version": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "pricing_source": {
          "type": "string",
          "enum": [
            "workspace",
            "platform"
          ]
        },
        "effective_price": {
          "oneOf": [
            {
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
                "current_standard_revision": {
                  "type": "string",
                  "format": "uuid"
                },
                "baseline_revision": {
                  "type": "string",
                  "format": "uuid"
                },
                "promotion_revision": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "format": "uuid"
                },
                "promotion_scope": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "enum": [
                    "global",
                    "customer",
                    null
                  ]
                },
                "selected_at": {
                  "type": "string",
                  "pattern": "^[0-9]+$"
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
                }
              },
              "required": [
                "price_id",
                "model_alias",
                "currency",
                "version",
                "current_standard_revision",
                "baseline_revision",
                "promotion_revision",
                "promotion_scope",
                "selected_at",
                "schedule"
              ]
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "dimensions",
        "meter",
        "price_id",
        "version",
        "pricing_source",
        "effective_price"
      ]
    }
  },
  "required": [
    "data"
  ]
}
```

### HTTP 400

Invalid exact identity, reason or version

### HTTP 401

Authentication required

### HTTP 403

Explicit platform administration required for changes

### HTTP 404

Workspace outside authority

### HTTP 409

Stale version, conflicting key, mismatched price or absent existing currency account

## Behavior and supported scope

Exact workspace/media dimensions/meter identity; currency follows the enrolled price. Platform administration is required for changes. Reads require this workspace authority or platform administration and reveal only its own effective selling price. No procurement or other customer promotions are returned. price_id must be explicitly present: null restores legacy media-card selection for future operations. The published media price must exactly match dimensions and meter and have an existing customer currency account. No balance, credit, route, qualification or operation is created. expected_version is zero initially; exact idempotent retries preserve their original outcome, changed reuse and stale versions conflict. Read effective_price is advisory, not a pinned task price or dispatch qualification. UTC epoch times and amounts are exact strings. Cache-Control: no-store for reads. Video admission reselects at a shared database time and atomically pins customer/Provider prices, independently qualified quantity, provenance and funds. Enrolling a price alone does not enable generation; exact current qualified supply and a supported route remain required. Existing task prices are not reselected after admission.

**Supported scope:** implemented
