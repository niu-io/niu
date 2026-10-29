---
title: "Atomically replace agreed media purchase terms"
description: "POST /api/v1/providers/{provider}/media-rates/replace"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/providers/{provider}/media-rates/replace`

Installation write authority only. Publishes an immutable replacement and ends the original schedule at the replacement's effective_from in one transaction. Dimensions and meter must match the original; current offer, credential, model and schema bindings are rechecked. Original terms, pinned job prices and earnings remain unchanged. Exact replay is idempotent while the configuration remains eligible. Conflicting cutoff, changed replay or stale binding rejects the whole transaction. No transfers, job cancellations, refunds or automatic retries occur.

Operation: `replaceSupplierMediaRate`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/providers/{provider}/media-rates/replace" \
  -H "Authorization: Bearer $NIU_MEMBER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "previous_revision",
    "rate"
  ],
  "properties": {
    "previous_revision": {
      "type": "string",
      "minLength": 1,
      "maxLength": 256
    },
    "rate": {
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
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "offer_revision": {
          "type": "string",
          "format": "uuid"
        },
        "vendor_revision": {
          "type": "integer",
          "minimum": 1,
          "format": "int64"
        },
        "model_revision": {
          "type": "integer",
          "minimum": 1,
          "format": "int64"
        },
        "schema_revision": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
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
              "type": "integer",
              "minimum": 0,
              "description": "Exact u64 smallest accounting units at the declared decimal precision. JavaScript SDK requires a safe integer."
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
              "type": "integer",
              "format": "int64",
              "description": "Unix seconds, inclusive."
            },
            "effective_until": {
              "type": [
                "integer",
                "null"
              ],
              "format": "int64",
              "description": "Unix seconds, exclusive; must exceed effective_from."
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
                "type": "integer",
                "format": "int64"
              },
              "effective_until": {
                "type": [
                  "integer",
                  "null"
                ],
                "format": "int64"
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
    }
  }
}
```

## Responses

### HTTP 200

Complete transition saved

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
        "revision",
        "effective_from"
      ],
      "properties": {
        "revision": {
          "type": "string"
        },
        "effective_from": {
          "type": "string",
          "pattern": "^-?[0-9]+$"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid rate, dimensions, meter or effective period

### HTTP 401

Valid management session required

### HTTP 403

Installation administration required

### HTTP 409

Original or current binding unavailable, cutoff conflict or changed replay

### HTTP 413

Configuration exceeds 128 KiB

### HTTP 503

Durable storage unavailable

## Behavior and supported scope

Installation write authority only. Publishes an immutable replacement and ends the original schedule at the replacement's effective_from in one transaction. Dimensions and meter must match the original; current offer, credential, model and schema bindings are rechecked. Original terms, pinned job prices and earnings remain unchanged. Exact replay is idempotent while the configuration remains eligible. Conflicting cutoff, changed replay or stale binding rejects the whole transaction. No transfers, job cancellations, refunds or automatic retries occur.
