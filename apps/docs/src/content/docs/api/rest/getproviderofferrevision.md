---
title: "Read an immutable Provider procurement quote"
description: "GET /admin/v1/providers/{provider}/offers/{offer}/revisions/{revision}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/providers/{provider}/offers/{offer}/revisions/{revision}`

Installation administrators or active members of this Provider may read a quote. Ordinary company/workspace ownership grants no procurement access. Provider, offer and revision must all match; inaccessible or missing records return 404. Text prices are exact currency nanounits per million tokens. Media revisions have null text prices; use the separate media rate-card contract. This read does not activate, qualify or reprice an offer. Procurement data must never be exposed in customer workspace billing. Internal identifiers are API references, not display labels.

Operation: `getProviderOfferRevision`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/providers/{provider}/offers/{offer}/revisions/{revision}" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
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

### offer

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### revision

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Immutable procurement quote; no upstream credentials or endpoint.

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
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "revision",
            "model_alias",
            "created_at",
            "rate_kind",
            "currency",
            "prompt_rate",
            "completion_rate",
            "cached_prompt_rate",
            "reasoning_completion_rate",
            "cache_write_prompt_rate"
          ],
          "properties": {
            "revision": {
              "type": "string",
              "format": "uuid"
            },
            "model_alias": {
              "type": "string"
            },
            "created_at": {
              "type": "string",
              "format": "date-time"
            },
            "rate_kind": {
              "const": "text"
            },
            "currency": {
              "type": "string",
              "pattern": "^[A-Z]{3}$"
            },
            "prompt_rate": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "completion_rate": {
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
              "description": "Reported cache-write input is a disjoint subset of aggregate input. A configured Provider rate prices it separately; missing quantity remains unresolved."
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
          "type": "object",
          "additionalProperties": false,
          "required": [
            "revision",
            "model_alias",
            "created_at",
            "rate_kind",
            "currency",
            "prompt_rate",
            "completion_rate",
            "cached_prompt_rate",
            "reasoning_completion_rate",
            "cache_write_prompt_rate"
          ],
          "properties": {
            "revision": {
              "type": "string",
              "format": "uuid"
            },
            "model_alias": {
              "type": "string"
            },
            "created_at": {
              "type": "string",
              "format": "date-time"
            },
            "rate_kind": {
              "const": "media"
            },
            "currency": {
              "type": "null"
            },
            "prompt_rate": {
              "type": "null"
            },
            "completion_rate": {
              "type": "null"
            },
            "cached_prompt_rate": {
              "type": "null"
            },
            "reasoning_completion_rate": {
              "type": "null",
              "description": "Reported reasoning output is a subset of total completion tokens. A configured rate prices that subset separately; missing quantity remains unresolved."
            },
            "cache_write_prompt_rate": {
              "type": "null",
              "description": "Reported cache-write input is a disjoint subset of aggregate input. A configured Provider rate prices it separately; missing quantity remains unresolved."
            }
          }
        }
      ]
    }
  }
}
```

### HTTP 400

Malformed path identifier.

### HTTP 401

Management authentication required.

### HTTP 404

Provider membership denied or quote identity not found.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Installation administrators or active members of this Provider may read a quote. Ordinary company/workspace ownership grants no procurement access. Provider, offer and revision must all match; inaccessible or missing records return 404. Text prices are exact currency nanounits per million tokens. Media revisions have null text prices; use the separate media rate-card contract. This read does not activate, qualify or reprice an offer. Procurement data must never be exposed in customer workspace billing. Internal identifiers are API references, not display labels.

**Supported scope:** implemented
