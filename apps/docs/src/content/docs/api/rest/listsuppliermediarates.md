---
title: "Read this Provider's agreed media purchase schedules"
description: "GET /api/v1/providers/{provider}/media-rates"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/providers/{provider}/media-rates`

Installation read access or active membership of this exact Provider only. Returns published terms and separate retirement cutoffs without customer prices, margins or credentials. Publication times not originally recorded remain null. Amounts, route revisions and effective times are exact strings on reads. The cursor is the last returned revision; page size is bounded and retirement never rewrites the original document.

Operation: `listSupplierMediaRates`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "operatorBearer": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/providers/{provider}/media-rates" \
  -H "Authorization: Bearer $NIU_MEMBER_TOKEN"
```

## Parameters

### provider

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### after

Location: **query**. Optional.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 256
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

Bounded purchase history

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data",
    "has_more",
    "next_after"
  ],
  "properties": {
    "has_more": {
      "type": "boolean"
    },
    "next_after": {
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
        "additionalProperties": false,
        "required": [
          "card",
          "retirement_effective_until",
          "created_at"
        ],
        "properties": {
          "card": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "revision",
              "offer_revision",
              "vendor_revision",
              "model_revision",
              "schema_revision",
              "tariff",
              "discounts"
            ],
            "properties": {
              "revision": {
                "type": "string"
              },
              "offer_revision": {
                "type": "string",
                "format": "uuid"
              },
              "vendor_revision": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              },
              "model_revision": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              },
              "schema_revision": {
                "type": "string"
              },
              "tariff": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "revision",
                  "dimensions",
                  "meter",
                  "currency",
                  "decimal_places",
                  "amount_units",
                  "per_quantity",
                  "minimum_quantity",
                  "rounding",
                  "effective_from",
                  "effective_until"
                ],
                "properties": {
                  "revision": {
                    "type": "string"
                  },
                  "dimensions": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "model",
                      "channel",
                      "resolution",
                      "reference_video"
                    ],
                    "properties": {
                      "model": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
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
                    }
                  },
                  "meter": {
                    "type": "string"
                  },
                  "currency": {
                    "type": "string"
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
                    "required": [
                      "numerator",
                      "denominator"
                    ],
                    "description": "Reduced nonnegative rational quantity; canonical decimal strings bounded to u128. Denominator must be positive. Maximum liability quantity must be positive.",
                    "properties": {
                      "numerator": {
                        "type": "string",
                        "maxLength": 39,
                        "pattern": "^(0|[1-9][0-9]*)$"
                      },
                      "denominator": {
                        "type": "string",
                        "maxLength": 39,
                        "pattern": "^[1-9][0-9]*$"
                      }
                    }
                  },
                  "minimum_quantity": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "numerator",
                      "denominator"
                    ],
                    "description": "Reduced nonnegative rational quantity; canonical decimal strings bounded to u128. Denominator must be positive. Maximum liability quantity must be positive.",
                    "properties": {
                      "numerator": {
                        "type": "string",
                        "maxLength": 39,
                        "pattern": "^(0|[1-9][0-9]*)$"
                      },
                      "denominator": {
                        "type": "string",
                        "maxLength": 39,
                        "pattern": "^[1-9][0-9]*$"
                      }
                    }
                  },
                  "rounding": {
                    "type": "string",
                    "enum": [
                      "Down",
                      "Up",
                      "HalfEven"
                    ]
                  },
                  "effective_from": {
                    "type": "string",
                    "pattern": "^-?[0-9]+$"
                  },
                  "effective_until": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^-?[0-9]+$"
                  }
                }
              },
              "discounts": {
                "type": "array",
                "maxItems": 64,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "revision",
                    "dimensions",
                    "offer",
                    "customer",
                    "effective_from",
                    "effective_until",
                    "priority",
                    "stacking",
                    "multiplier"
                  ],
                  "properties": {
                    "revision": {
                      "type": "string"
                    },
                    "dimensions": {
                      "anyOf": [
                        {
                          "type": "object",
                          "additionalProperties": false,
                          "required": [
                            "model",
                            "channel",
                            "resolution",
                            "reference_video"
                          ],
                          "properties": {
                            "model": {
                              "type": "string",
                              "minLength": 1,
                              "maxLength": 256
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
                          }
                        },
                        {
                          "type": "null"
                        }
                      ]
                    },
                    "offer": {
                      "type": [
                        "string",
                        "null"
                      ]
                    },
                    "customer": {
                      "type": [
                        "string",
                        "null"
                      ]
                    },
                    "effective_from": {
                      "type": "string",
                      "pattern": "^-?[0-9]+$"
                    },
                    "effective_until": {
                      "type": [
                        "string",
                        "null"
                      ],
                      "pattern": "^-?[0-9]+$"
                    },
                    "priority": {
                      "type": "integer"
                    },
                    "stacking": {
                      "type": "string",
                      "enum": [
                        "Exclusive",
                        "Multiply"
                      ]
                    },
                    "multiplier": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "numerator",
                        "denominator"
                      ],
                      "description": "Reduced nonnegative rational quantity; canonical decimal strings bounded to u128. Denominator must be positive. Maximum liability quantity must be positive.",
                      "properties": {
                        "numerator": {
                          "type": "string",
                          "maxLength": 39,
                          "pattern": "^(0|[1-9][0-9]*)$"
                        },
                        "denominator": {
                          "type": "string",
                          "maxLength": 39,
                          "pattern": "^[1-9][0-9]*$"
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "retirement_effective_until": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^-?[0-9]+$"
          },
          "created_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid page range or cursor

### HTTP 401

Valid management session required

### HTTP 404

No active membership for this Provider

### HTTP 503

Durable storage unavailable

## Behavior and supported scope

Installation read access or active membership of this exact Provider only. Returns published terms and separate retirement cutoffs without customer prices, margins or credentials. Publication times not originally recorded remain null. Amounts, route revisions and effective times are exact strings on reads. The cursor is the last returned revision; page size is bounded and retirement never rewrites the original document.
