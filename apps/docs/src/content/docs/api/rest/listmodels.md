---
title: "List key-accessible model aliases and workspace customer prices"
description: "GET /v1/models"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/models`

Requires a current workspace API key and filters aliases by its model grants and organization access. customer_pricing is the current workspace selling tariff or null; personal credential routes omit customer prices. Token rates use currency nanounits per million tokens. request_fee_nanos and minimum_charge_nanos use currency nanounits per known completed request. Amounts and revisions are exact strings. Listing a model or tariff does not qualify generation or guarantee admission, balance or upstream availability. No Supplier procurement rates, upstream credentials, endpoints or private model mappings are exposed.

Operation: `listModels`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  },
  {
    "niuApiKeyAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/models" \
  -H "Authorization: Bearer $NIU_API_KEY"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Current key-visible aliases and customer-only prices.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "object",
    "data"
  ],
  "properties": {
    "object": {
      "type": "string",
      "const": "list"
    },
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "object",
          "owned_by",
          "customer_pricing"
        ],
        "properties": {
          "id": {
            "type": "string",
            "description": "Public model alias."
          },
          "object": {
            "type": "string",
            "const": "model"
          },
          "owned_by": {
            "type": "string",
            "const": "niu"
          },
          "customer_pricing": {
            "anyOf": [
              {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "revision",
                  "currency",
                  "unit",
                  "prompt_rate",
                  "completion_rate",
                  "cached_prompt_rate",
                  "minimum_charge_nanos",
                  "request_fee_nanos",
                  "reasoning_completion_rate",
                  "cache_write_prompt_rate",
                  "context_tiers"
                ],
                "properties": {
                  "revision": {
                    "type": "string",
                    "format": "uuid"
                  },
                  "currency": {
                    "type": "string",
                    "pattern": "^[A-Z]{3}$"
                  },
                  "unit": {
                    "type": "string",
                    "const": "nanounits_per_million_tokens",
                    "description": "Unit for token rate fields only. Minimum and request fee are currency nanounits per known completed request."
                  },
                  "prompt_rate": {
                    "type": "string",
                    "pattern": "^[0-9]+$"
                  },
                  "completion_rate": {
                    "type": "string",
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
                  "cached_prompt_rate": {
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
                    "pattern": "^[0-9]+$",
                    "description": "Reported reasoning output is a subset of total completion tokens. A configured rate prices that subset separately; missing quantity remains unresolved."
                  },
                  "cache_write_prompt_rate": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^[0-9]+$",
                    "description": "Reported cache-write input is a disjoint subset of aggregate input. A configured rate prices it separately; missing quantity remains unresolved."
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
                          "pattern": "^[0-9]+$",
                          "description": "Positive inclusive aggregate input threshold, at most 9223372036854775807."
                        },
                        "prompt_rate": {
                          "type": "string",
                          "pattern": "^[0-9]+$",
                          "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
                        },
                        "completion_rate": {
                          "type": "string",
                          "pattern": "^[0-9]+$",
                          "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
                        },
                        "cached_prompt_rate": {
                          "type": [
                            "string",
                            "null"
                          ],
                          "pattern": "^[0-9]+$",
                          "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
                        },
                        "cache_write_prompt_rate": {
                          "type": [
                            "string",
                            "null"
                          ],
                          "pattern": "^[0-9]+$",
                          "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
                        },
                        "reasoning_completion_rate": {
                          "type": [
                            "string",
                            "null"
                          ],
                          "pattern": "^[0-9]+$",
                          "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
                        }
                      }
                    },
                    "description": "Complete whole-request schedules; highest inclusive input threshold wins. Null category rates do not inherit the base schedule. Empty array clears tiers; omitting existing tiers conflicts."
                  }
                }
              },
              {
                "type": "null"
              }
            ]
          }
        }
      }
    }
  }
}
```

### HTTP 401

Missing, revoked, expired or invalid key.

### HTTP 403

Current credential access policy denies the request.

### HTTP 503

Storage or route configuration unavailable.

## Behavior and supported scope

Requires a current workspace API key and filters aliases by its model grants and organization access. customer_pricing is the current workspace selling tariff or null; personal credential routes omit customer prices. Token rates use currency nanounits per million tokens. request_fee_nanos and minimum_charge_nanos use currency nanounits per known completed request. Amounts and revisions are exact strings. Listing a model or tariff does not qualify generation or guarantee admission, balance or upstream availability. No Supplier procurement rates, upstream credentials, endpoints or private model mappings are exposed.

**Supported scope:** implemented
