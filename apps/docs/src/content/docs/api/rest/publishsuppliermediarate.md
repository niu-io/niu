---
title: "Publish confidential agreed Provider media purchase terms"
description: "POST /api/v1/providers/{provider}/media-rates"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/providers/{provider}/media-rates`

Installation write permission only; Provider membership and company roles do not authorize procurement configuration. Pins the Provider's current qualified offer and exact credential/model/schema revisions. Publication is immutable and exact replay is idempotent. Missing, ambiguous, stale or differently metered purchase rates block commercial video dispatch before egress. Customer selling rates are independent. No customer charge or platform margin belongs in this body; owner-funded personal use does not acquire a Provider earning. Maximum JSON body is 128 KiB.

Operation: `publishSupplierMediaRate`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/providers/{provider}/media-rates" \
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
```

## Responses

### HTTP 200

Saved revision or identical replay

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "additionalProperties": false,
  "properties": {
    "data": {
      "type": "object",
      "required": [
        "revision"
      ],
      "additionalProperties": false,
      "properties": {
        "revision": {
          "type": "string"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid tariff or discount

### HTTP 401

Installation authentication required

### HTTP 403

Installation write permission required

### HTTP 409

Changed revision or mismatched/unqualified Provider route

### HTTP 413

Body exceeds 128 KiB

### HTTP 422

Malformed typed JSON

### HTTP 503

Durable storage unavailable

## Behavior and supported scope

Installation write permission only; Provider membership and company roles do not authorize procurement configuration. Pins the Provider's current qualified offer and exact credential/model/schema revisions. Publication is immutable and exact replay is idempotent. Missing, ambiguous, stale or differently metered purchase rates block commercial video dispatch before egress. Customer selling rates are independent. No customer charge or platform margin belongs in this body; owner-funded personal use does not acquire a Provider earning. Maximum JSON body is 128 KiB.
