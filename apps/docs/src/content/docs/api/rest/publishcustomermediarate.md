---
title: "Publish an immutable customer video selling schedule"
description: "POST /api/v1/organizations/{organization}/billing/media-rates"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/billing/media-rates`

Platform administrator with write access required. Ordinary company members and inference keys cannot publish prices or liability limits. Pins exact credential/model/schema revisions and a configured qualification reference; registration does not qualify commercial supply or enable video dispatch. Rejects personal credentials and stale routes. Replaying identical current configuration is idempotent; changed content under the same revision conflicts. Procurement terms never belong in this body. Maximum JSON body is 128 KiB.

Operation: `publishCustomerMediaRate`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/media-rates" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
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
      "type": "string",
      "minLength": 1,
      "maxLength": 256
    },
    "vendor_id": {
      "type": "string",
      "format": "uuid",
      "description": "Internal route reference; never a display label."
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
    "offer_revision": {
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
      "type": "string",
      "minLength": 1,
      "maxLength": 256,
      "description": "Reference to independently qualified upper-bound evidence; a point estimate is insufficient."
    }
  }
}
```

## Responses

### HTTP 200

Customer selling revision published or identical replay accepted

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "revision"
      ],
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

Invalid tariff, dimensions, discount or liability configuration

### HTTP 401

Administrator authentication required

### HTTP 403

Platform-administrator write permission required

### HTTP 409

Changed revision, stale route or personal credential

### HTTP 413

Body exceeds 128 KiB

### HTTP 422

Malformed typed JSON body

### HTTP 503

Durable storage unavailable

## Behavior and supported scope

Platform administrator with write access required. Ordinary company members and inference keys cannot publish prices or liability limits. Pins exact credential/model/schema revisions and a configured qualification reference; registration does not qualify commercial supply or enable video dispatch. Rejects personal credentials and stale routes. Replaying identical current configuration is idempotent; changed content under the same revision conflicts. Procurement terms never belong in this body. Maximum JSON body is 128 KiB.

**Supported scope:** implemented
