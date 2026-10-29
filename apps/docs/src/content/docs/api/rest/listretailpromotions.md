---
title: "Read promotion periods with complete retirement coverage"
description: "GET /api/v1/pricing/standard-prices/{price}/promotions"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/pricing/standard-prices/{price}/promotions`

Explicit platform administration only. Each bounded page joins every returned promotion to its committed cutoff and original standard, regardless of history pagination. as_of is database UTC epoch seconds; state is scheduled, within_period or ended based on original start and the lesser of original end/cutoff. Within-period is temporal eligibility only: a global rule can be overridden by a customer rule, and this is not supply, enrollment, spending permission or a request snapshot. Current head version, original/results and names are from one statement snapshot. Other pages have separate snapshots/times. Newest publication version first; pass next_before unchanged. A cursor must name a promotion of this price; unavailable price/cursor returns 409. No procurement, credentials or financial mutations. Cache-Control no-store. The current standard and management version share this page snapshot; use them together for a new publication, then rely on server version comparison.

Operation: `listRetailPromotions`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/pricing/standard-prices/{price}/promotions" \
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
  "type": "string"
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

Promotion state at the returned observation time

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "price_id",
    "model_alias",
    "currency",
    "current_version",
    "as_of",
    "next_before",
    "data",
    "standard"
  ],
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
      "type": "string"
    },
    "as_of": {
      "type": "string"
    },
    "next_before": {
      "type": [
        "string",
        "null"
      ]
    },
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "required": [
          "version",
          "baseline_version",
          "reason",
          "effective_from",
          "effective_until",
          "eligibility_until",
          "revision",
          "baseline_revision",
          "created_at",
          "baseline_published_at",
          "original_schedule",
          "schedule",
          "scope",
          "customer_organization_id",
          "customer_name",
          "customer_created_at",
          "retirement_effective_until",
          "state"
        ],
        "properties": {
          "version": {
            "type": "string"
          },
          "baseline_version": {
            "type": "string"
          },
          "reason": {
            "type": "string"
          },
          "effective_from": {
            "type": "string"
          },
          "effective_until": {
            "type": "string"
          },
          "eligibility_until": {
            "type": "string"
          },
          "revision": {
            "type": "string",
            "format": "uuid"
          },
          "baseline_revision": {
            "type": "string",
            "format": "uuid"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "baseline_published_at": {
            "type": "string",
            "format": "date-time"
          },
          "original_schedule": {
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
          "customer_created_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "retirement_effective_until": {
            "type": [
              "string",
              "null"
            ]
          },
          "state": {
            "type": "string",
            "enum": [
              "scheduled",
              "within_period",
              "ended"
            ]
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
        }
      }
    },
    "standard": {
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
  }
}
```

### HTTP 400

Invalid limit or positive version cursor

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 409

Price or promotion cursor unavailable; restart pagination

## Behavior and supported scope

Explicit platform administration only. Each bounded page joins every returned promotion to its committed cutoff and original standard, regardless of history pagination. as_of is database UTC epoch seconds; state is scheduled, within_period or ended based on original start and the lesser of original end/cutoff. Within-period is temporal eligibility only: a global rule can be overridden by a customer rule, and this is not supply, enrollment, spending permission or a request snapshot. Current head version, original/results and names are from one statement snapshot. Other pages have separate snapshots/times. Newest publication version first; pass next_before unchanged. A cursor must name a promotion of this price; unavailable price/cursor returns 409. No procurement, credentials or financial mutations. Cache-Control no-store. The current standard and management version share this page snapshot; use them together for a new publication, then rely on server version comparison.

**Supported scope:** implemented
