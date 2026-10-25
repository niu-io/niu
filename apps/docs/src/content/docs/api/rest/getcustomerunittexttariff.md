---
title: "Read the latest explicit Credits text tariff for a model"
description: "GET /api/v1/platform/units/tariffs"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/platform/units/tariffs`

Platform administration required. Reads the latest saved Credits consumption tariff, not a conversion from payment currency. It does not establish route readiness, enable billing mode or reserve capacity. Historical requests must retain their bound revision. Category null means ordinary pricing, not zero; each context tier is a complete schedule. No Provider procurement price is exposed.

Operation: `getCustomerUnitTextTariff`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/platform/units/tariffs" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  --url-query 'model=<MODEL>'
```

## Parameters

### model

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

Original immutable Credits text tariff

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
      "additionalProperties": false,
      "required": [
        "revision",
        "definition_revision",
        "model_alias",
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
        "price": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "prompt_rate",
            "completion_rate",
            "request_fee_atoms",
            "minimum_charge_atoms",
            "context_tiers"
          ],
          "properties": {
            "prompt_rate": {
              "type": "string",
              "pattern": "^[0-9]{1,16}$",
              "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
            },
            "completion_rate": {
              "type": "string",
              "pattern": "^[0-9]{1,16}$",
              "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
            },
            "cached_prompt_rate": {
              "type": [
                "string",
                "null"
              ],
              "pattern": "^[0-9]{1,16}$",
              "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
            },
            "cache_write_prompt_rate": {
              "type": [
                "string",
                "null"
              ],
              "pattern": "^[0-9]{1,16}$",
              "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
            },
            "reasoning_completion_rate": {
              "type": [
                "string",
                "null"
              ],
              "pattern": "^[0-9]{1,16}$",
              "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
            },
            "request_fee_atoms": {
              "type": "string",
              "pattern": "^[0-9]{1,16}$",
              "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
            },
            "minimum_charge_atoms": {
              "type": "string",
              "pattern": "^[0-9]{1,16}$",
              "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
            },
            "context_tiers": {
              "type": "array",
              "maxItems": 32,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "minimum_input_tokens",
                  "prompt_rate",
                  "completion_rate"
                ],
                "properties": {
                  "minimum_input_tokens": {
                    "type": "string",
                    "pattern": "^[1-9][0-9]{0,18}$"
                  },
                  "prompt_rate": {
                    "type": "string",
                    "pattern": "^[0-9]{1,16}$",
                    "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
                  },
                  "completion_rate": {
                    "type": "string",
                    "pattern": "^[0-9]{1,16}$",
                    "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
                  },
                  "cached_prompt_rate": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^[0-9]{1,16}$",
                    "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
                  },
                  "cache_write_prompt_rate": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^[0-9]{1,16}$",
                    "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
                  },
                  "reasoning_completion_rate": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^[0-9]{1,16}$",
                    "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
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

### HTTP 400

Invalid model, exact quantity or context schedule

### HTTP 401

Authentication unavailable or revoked

### HTTP 403

Platform administration required

### HTTP 404

No explicitly published Credits text tariff

### HTTP 503

Storage unavailable

## Behavior and supported scope

Platform administration required. Reads the latest saved Credits consumption tariff, not a conversion from payment currency. It does not establish route readiness, enable billing mode or reserve capacity. Historical requests must retain their bound revision. Category null means ordinary pricing, not zero; each context tier is a complete schedule. No Provider procurement price is exposed.

**Supported scope:** implemented
