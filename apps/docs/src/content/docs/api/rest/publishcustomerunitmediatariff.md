---
title: "Publish a versioned Credits media consumption tariff"
description: "POST /api/v1/platform/units/media/tariffs"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/platform/units/media/tariffs`

Platform administration required and rechecked transactionally for operators. Publish atom-denominated media consumption rates independently of purchase conversion and monetary media rate cards. New publication requires the current unit definition and installation revision. Concurrent stale writes conflict. Equal idempotent retries return their original normalized publication; changed input conflicts. Explicit zero is valid; absence of a publication is unavailable. Publishing a tariff does not activate billing mode, issue Credits, convert money balances, admit requests or change prior request bindings.

Operation: `publishCustomerUnitMediaTariff`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/platform/units/media/tariffs" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

No path, query, or header parameters are declared.

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "model_alias",
    "definition_revision",
    "expected_revision",
    "idempotency_key",
    "price"
  ],
  "properties": {
    "model_alias": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "definition_revision": {
      "type": "string",
      "pattern": "^[1-9][0-9]{0,18}$"
    },
    "expected_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,18})$"
    },
    "idempotency_key": {
      "type": "string",
      "format": "uuid"
    },
    "price": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "dimensions",
        "meter",
        "amount_atoms",
        "per_quantity",
        "minimum_quantity",
        "rounding"
      ],
      "properties": {
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
              "maxLength": 200
            },
            "channel": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200
            },
            "resolution": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200
            },
            "reference_video": {
              "type": "boolean"
            }
          }
        },
        "meter": {
          "type": "string",
          "enum": [
            "video_tokens"
          ]
        },
        "amount_atoms": {
          "type": "string",
          "pattern": "^[0-9]{1,16}$"
        },
        "per_quantity": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "numerator",
            "denominator"
          ],
          "properties": {
            "numerator": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "denominator": {
              "type": "string",
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
          "properties": {
            "numerator": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "denominator": {
              "type": "string",
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
        }
      }
    }
  }
}
```

## Responses

### HTTP 200

Original immutable Credits media tariff

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
        "revision",
        "definition_revision",
        "model_alias",
        "channel",
        "resolution",
        "reference_video",
        "meter",
        "price"
      ],
      "properties": {
        "revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]{0,18}$"
        },
        "definition_revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]{0,18}$"
        },
        "model_alias": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "channel": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "resolution": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "reference_video": {
          "type": "boolean"
        },
        "meter": {
          "type": "string",
          "enum": [
            "video_tokens"
          ]
        },
        "price": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "dimensions",
            "meter",
            "amount_atoms",
            "per_quantity",
            "minimum_quantity",
            "rounding"
          ],
          "properties": {
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
                  "maxLength": 200
                },
                "channel": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 200
                },
                "resolution": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 200
                },
                "reference_video": {
                  "type": "boolean"
                }
              }
            },
            "meter": {
              "type": "string",
              "enum": [
                "video_tokens"
              ]
            },
            "amount_atoms": {
              "type": "string",
              "pattern": "^[0-9]{1,16}$"
            },
            "per_quantity": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "numerator",
                "denominator"
              ],
              "properties": {
                "numerator": {
                  "type": "string",
                  "pattern": "^[0-9]+$"
                },
                "denominator": {
                  "type": "string",
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
              "properties": {
                "numerator": {
                  "type": "string",
                  "pattern": "^[0-9]+$"
                },
                "denominator": {
                  "type": "string",
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
            }
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid model, dimensions, exact quantity or rounding mode

### HTTP 401

Authentication unavailable or revoked

### HTTP 403

Platform administration required

### HTTP 409

Stale installation/unit revision or conflicting idempotency input

### HTTP 422

Malformed request

### HTTP 503

Storage unavailable

## Behavior and supported scope

Platform administration required and rechecked transactionally for operators. Publish atom-denominated media consumption rates independently of purchase conversion and monetary media rate cards. New publication requires the current unit definition and installation revision. Concurrent stale writes conflict. Equal idempotent retries return their original normalized publication; changed input conflicts. Explicit zero is valid; absence of a publication is unavailable. Publishing a tariff does not activate billing mode, issue Credits, convert money balances, admit requests or change prior request bindings.

**Supported scope:** implemented
