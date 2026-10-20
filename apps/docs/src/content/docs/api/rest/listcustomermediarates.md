---
title: "Read bounded immutable customer selling history"
description: "GET /api/v1/organizations/{organization}/billing/media-rates"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/billing/media-rates`

Platform-administrator read permission required. Installation credentials and explicitly granted member administrators are supported. Ordinary company members and inference keys cannot read platform pricing configuration. Returns original cards, immutable retirement and creation time; never reads Provider purchase terms. Card vendor/model revisions, tariff amount/time values and discount times are exact decimal strings, while quantities retain numerator/denominator strings. Ordering and cursors use the immutable card revision.

Operation: `listCustomerMediaRates`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/media-rates" \
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

Scoped history page, including an empty page

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "has_more",
    "next_after"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "card",
          "retirement_effective_until",
          "created_at"
        ],
        "properties": {
          "card": {
            "type": "object",
            "required": [
              "revision",
              "vendor_id",
              "vendor_revision",
              "model_revision",
              "schema_revision",
              "offer_revision",
              "tariff",
              "discounts",
              "maximum_quantity",
              "liability_qualification_revision"
            ],
            "properties": {
              "revision": {
                "type": "string"
              },
              "vendor_id": {
                "type": "string",
                "format": "uuid"
              },
              "vendor_revision": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "model_revision": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "schema_revision": {
                "type": "string"
              },
              "offer_revision": {
                "type": "string"
              },
              "maximum_quantity": {
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
              "liability_qualification_revision": {
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
                  "effective_from"
                ],
                "properties": {
                  "revision": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
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
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  },
                  "currency": {
                    "type": "string",
                    "pattern": "^[A-Z]{3}$"
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
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "revision",
                    "effective_from",
                    "priority",
                    "stacking",
                    "multiplier"
                  ],
                  "properties": {
                    "revision": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 256
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
                      "type": "integer",
                      "format": "int32"
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
    },
    "has_more": {
      "type": "boolean"
    },
    "next_after": {
      "type": [
        "string",
        "null"
      ]
    }
  }
}
```

### HTTP 400

Invalid page size or cursor

### HTTP 401

Administrator authentication required

### HTTP 403

Platform-administrator read permission required

### HTTP 503

Durable storage unavailable

## Behavior and supported scope

Platform-administrator read permission required. Installation credentials and explicitly granted member administrators are supported. Ordinary company members and inference keys cannot read platform pricing configuration. Returns original cards, immutable retirement and creation time; never reads Provider purchase terms. Card vendor/model revisions, tariff amount/time values and discount times are exact decimal strings, while quantities retain numerator/denominator strings. Ordering and cursors use the immutable card revision.

**Supported scope:** implemented
