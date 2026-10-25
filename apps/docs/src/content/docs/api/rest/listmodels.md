---
title: "List key-accessible model aliases and workspace customer prices"
description: "GET /v1/models"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/models`

Requires a current workspace API key and filters aliases by its model grants and organization access. customer_pricing is the current workspace selling tariff or null; personal credential routes omit customer prices. Token rates use currency nanounits per million tokens. request_fee_nanos and minimum_charge_nanos use currency nanounits per known completed request. Amounts are exact strings. Listing a model or tariff does not qualify generation or guarantee admission, balance or upstream availability. No Provider procurement rates, internal revision identifiers, upstream credentials, endpoints or private model mappings are exposed. Enrolled text models resolve the own-customer promotion, then global promotion, then standard price at server time; this is advisory until admission pins a concrete revision. No other-customer rules are exposed.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

Authentication alternative: `bearerAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/models" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/models" \
  -H "X-Niu-API-Key: $NIU_API_KEY"
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
                  },
                  "pricing_source": {
                    "type": "string",
                    "enum": [
                      "workspace",
                      "platform"
                    ]
                  },
                  "promotion_scope": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "enum": [
                      "global",
                      "customer",
                      null
                    ]
                  },
                  "selected_at": {
                    "type": "string",
                    "pattern": "^[0-9]+$"
                  },
                  "price_version": {
                    "type": "string",
                    "pattern": "^[0-9]+$"
                  }
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "customer_unit_pricing": {
            "type": [
              "object",
              "null"
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

Requires a current workspace API key and filters aliases by its model grants and organization access. customer_pricing is the current workspace selling tariff or null; personal credential routes omit customer prices. Token rates use currency nanounits per million tokens. request_fee_nanos and minimum_charge_nanos use currency nanounits per known completed request. Amounts are exact strings. Listing a model or tariff does not qualify generation or guarantee admission, balance or upstream availability. No Provider procurement rates, internal revision identifiers, upstream credentials, endpoints or private model mappings are exposed. Enrolled text models resolve the own-customer promotion, then global promotion, then standard price at server time; this is advisory until admission pins a concrete revision. No other-customer rules are exposed.

**Supported scope:** implemented
