---
title: "Read immutable standard and promotion history"
description: "GET /api/v1/pricing/standard-prices/{price}/history"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/pricing/standard-prices/{price}/history`

Explicit platform administration required; ordinary customer/Provider membership does not grant access. Platform configuration history can include different customer-specific rules; never expose this projection to customers. Version keyset descending, pass next_before unchanged. Each page is one snapshot. Names are customer-company display values; UUIDs are routing references. No procurement or customer usage. Cache-Control: no-store.

Operation: `getRetailPriceHistory`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/pricing/standard-prices/{price}/history" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
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

### before

Location: **query**. Optional.

```json
{
  "type": "string",
  "pattern": "^[0-9]+$"
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
    "current_version": {
      "type": "string",
      "pattern": "^[0-9]+$"
    },
    "current_revision": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    },
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "revision": {
            "type": "string",
            "format": "uuid"
          },
          "version": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "action": {
            "type": "string",
            "enum": [
              "standard_published",
              "promotion_published",
              "promotion_retired"
            ]
          },
          "reason": {
            "type": "string",
            "minLength": 1,
            "maxLength": 500
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "standard_schedule": {
            "anyOf": [
              {
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
              {
                "type": "null"
              }
            ]
          },
          "promotion": {
            "anyOf": [
              {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "baseline_revision",
                  "scope",
                  "customer_organization_id",
                  "customer_name",
                  "effective_from",
                  "effective_until",
                  "schedule"
                ],
                "properties": {
                  "baseline_revision": {
                    "type": "string",
                    "format": "uuid"
                  },
                  "scope": {
                    "type": "string",
                    "enum": [
                      "global",
                      "customer"
                    ]
                  },
                  "customer_organization_id": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "format": "uuid"
                  },
                  "customer_name": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "effective_from": {
                    "type": "string",
                    "pattern": "^[0-9]+$"
                  },
                  "effective_until": {
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
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "retirement": {
            "anyOf": [
              {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "promotion_revision",
                  "effective_until"
                ],
                "properties": {
                  "promotion_revision": {
                    "type": "string",
                    "format": "uuid"
                  },
                  "effective_until": {
                    "type": "string",
                    "pattern": "^[0-9]+$"
                  }
                }
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": [
          "revision",
          "version",
          "action",
          "reason",
          "created_at",
          "standard_schedule",
          "promotion",
          "retirement"
        ]
      }
    },
    "next_before": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[1-9][0-9]*$"
    }
  },
  "required": [
    "price_id",
    "model_alias",
    "currency",
    "current_version",
    "current_revision",
    "data",
    "next_before"
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

Explicit platform administration required; ordinary customer/Provider membership does not grant access. Platform configuration history can include different customer-specific rules; never expose this projection to customers. Version keyset descending, pass next_before unchanged. Each page is one snapshot. Names are customer-company display values; UUIDs are routing references. No procurement or customer usage. Cache-Control: no-store.

**Supported scope:** implemented
