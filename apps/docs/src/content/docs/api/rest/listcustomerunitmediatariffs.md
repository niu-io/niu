---
title: "List latest explicit Credits media tariffs"
description: "GET /api/v1/platform/units/media/tariffs"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/platform/units/media/tariffs`

Platform administration required. Reads the latest saved Credits media consumption tariff per dimension tuple (model_alias, channel, resolution, reference_video), not a conversion from payment currency. Optional model filter scopes to one model alias. No Provider procurement price is exposed.

Operation: `listCustomerUnitMediaTariffs`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/platform/units/media/tariffs" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### model

Location: **query**. Optional.

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

Latest explicit Credits media tariffs by dimension tuple

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
      "type": "array",
      "items": {
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
}
```

### HTTP 400

Invalid model query

### HTTP 401

Authentication unavailable or revoked

### HTTP 403

Platform administration required

### HTTP 503

Storage unavailable

## Behavior and supported scope

Platform administration required. Reads the latest saved Credits media consumption tariff per dimension tuple (model_alias, channel, resolution, reference_video), not a conversion from payment currency. Optional model filter scopes to one model alias. No Provider procurement price is exposed.

**Supported scope:** implemented
