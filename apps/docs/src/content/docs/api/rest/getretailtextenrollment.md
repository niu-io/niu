---
title: "Read own workspace retail pricing mode"
description: "GET /api/v1/organizations/{organization}/projects/{project}/billing/retail-price-enrollment"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/billing/retail-price-enrollment`

Requires workspace read authority or platform administration. Current configuration only, no other-customer rules, procurement or usage. Absent saved enrollment means workspace pricing, version zero and null price_id. This does not establish an available route or spending permission. Internal references are API values, never display names. Cache-Control: no-store. Effective price is an advisory own-customer selection at server time under the workspace and price locks; null in workspace pricing mode. No other-customer rules are returned.

Operation: `getRetailTextEnrollment`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/billing/retail-price-enrollment" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
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

### model_alias

Location: **query**. **Required.**

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 200
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Current configuration or exact committed outcome

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
        "model_alias",
        "price_id",
        "version",
        "pricing_source",
        "effective_price"
      ],
      "properties": {
        "model_alias": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
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
            "platform",
            "workspace"
          ]
        },
        "effective_price": {
          "anyOf": [
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
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

### HTTP 400

Invalid model alias

### HTTP 401

Authentication required

### HTTP 404

Workspace outside authority

### HTTP 409

Unknown authorized workspace

## Behavior and supported scope

Requires workspace read authority or platform administration. Current configuration only, no other-customer rules, procurement or usage. Absent saved enrollment means workspace pricing, version zero and null price_id. This does not establish an available route or spending permission. Internal references are API values, never display names. Cache-Control: no-store. Effective price is an advisory own-customer selection at server time under the workspace and price locks; null in workspace pricing mode. No other-customer rules are returned.

**Supported scope:** implemented
