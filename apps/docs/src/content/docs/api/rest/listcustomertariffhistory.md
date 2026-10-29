---
title: "Read immutable customer text price history"
description: "GET /api/v1/organizations/{organization}/projects/{project}/billing/tariffs/{model}/history"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/billing/tariffs/{model}/history`

Same scoped management read permission as workspace billing. Newest first by created_at and revision UUID, with exclusive keyset pagination. A single database statement observes the current revision and page coherently. All prices are exact decimal strings: token rates are nanounits per million tokens, minimum and fixed fees are currency nanounits per known completed request. Includes no Provider procurement prices or upstream credentials. Unknown model returns 404; an unknown or foreign cursor returns 409. A newer publication can appear on a fresh first page but does not duplicate earlier entries when following an existing cursor. This read does not publish or reprice anything. Revision identifiers are API references, not display labels.

Operation: `listCustomerTariffHistory`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/billing/tariffs/{model}/history" \
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

### project

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### model

Location: **path**. **Required.**

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 200
}
```

### before

Location: **query**. Optional. Exclusive revision cursor belonging to this workspace and model.

```json
{
  "type": "string",
  "format": "uuid"
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

Current pointer and immutable bounded history page.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "current_revision",
    "data",
    "has_more",
    "next_before"
  ],
  "properties": {
    "current_revision": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    },
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "model_alias",
          "revision",
          "currency",
          "created_at",
          "is_current",
          "prompt_rate",
          "completion_rate",
          "minimum_charge_nanos",
          "request_fee_nanos",
          "cached_prompt_rate",
          "reasoning_completion_rate",
          "cache_write_prompt_rate",
          "context_tiers"
        ],
        "properties": {
          "model_alias": {
            "type": "string"
          },
          "revision": {
            "type": "string",
            "format": "uuid"
          },
          "currency": {
            "type": "string",
            "pattern": "^[A-Z]{3}$"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "is_current": {
            "type": "boolean"
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
      }
    },
    "has_more": {
      "type": "boolean"
    },
    "next_before": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    }
  }
}
```

### HTTP 400

Invalid path, query, model or page limit.

### HTTP 401

Management authentication required.

### HTTP 404

Workspace access denied or no tariff for this model.

### HTTP 409

Cursor does not belong to this workspace/model history.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Same scoped management read permission as workspace billing. Newest first by created_at and revision UUID, with exclusive keyset pagination. A single database statement observes the current revision and page coherently. All prices are exact decimal strings: token rates are nanounits per million tokens, minimum and fixed fees are currency nanounits per known completed request. Includes no Provider procurement prices or upstream credentials. Unknown model returns 404; an unknown or foreign cursor returns 409. A newer publication can appear on a fresh first page but does not duplicate earlier entries when following an existing cursor. This read does not publish or reprice anything. Revision identifiers are API references, not display labels.

**Supported scope:** implemented
