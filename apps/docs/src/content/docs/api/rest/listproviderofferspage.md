---
title: "Page current Provider offers and rate revisions"
description: "GET /api/v1/providers/{provider}/offers"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/providers/{provider}/offers`

Platform administration or active membership of this Provider required. Canonical model-alias keyset order, 1–100 entries per page. Includes paused and unqualified drafts; does not activate an offer or establish commercial qualification. after must identify an existing offer of this Provider or returns 409. Follow next_after until null. Each page has one statement snapshot; multiple pages are not a frozen snapshot. No customer identities, requests, credentials or endpoint data. Dashboard offers remain a 1000-row preview with offers_has_more.

Operation: `listProviderOffersPage`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/providers/{provider}/offers" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
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

### provider

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### after

Location: **query**. Optional.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 200
}
```

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 100
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Current scoped offers and continuation.

Response headers:

```json
{
  "Cache-Control": {
    "schema": {
      "type": "string",
      "const": "no-store"
    }
  }
}
```

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data",
    "next_after"
  ],
  "properties": {
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "model_alias",
          "active",
          "qualified",
          "revision",
          "rate_kind",
          "currency",
          "prompt_rate",
          "completion_rate",
          "cached_prompt_rate",
          "route_ready",
          "reasoning_completion_rate",
          "cache_write_prompt_rate"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "model_alias": {
            "type": "string"
          },
          "active": {
            "type": "boolean"
          },
          "qualified": {
            "type": "boolean"
          },
          "revision": {
            "type": "string",
            "format": "uuid"
          },
          "rate_kind": {
            "type": "string",
            "enum": [
              "text",
              "media"
            ]
          },
          "currency": {
            "type": [
              "string",
              "null"
            ]
          },
          "prompt_rate": {
            "type": [
              "string",
              "null"
            ]
          },
          "completion_rate": {
            "type": [
              "string",
              "null"
            ]
          },
          "cached_prompt_rate": {
            "type": [
              "string",
              "null"
            ]
          },
          "route_ready": {
            "type": "boolean"
          },
          "reasoning_completion_rate": {
            "type": [
              "string",
              "null"
            ],
            "description": "Reported reasoning output is a subset of total completion tokens. A configured rate prices that subset separately; missing quantity remains unresolved."
          },
          "cache_write_prompt_rate": {
            "type": [
              "string",
              "null"
            ],
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
      }
    },
    "next_after": {
      "type": [
        "string",
        "null"
      ]
    }
  }
}
```

### HTTP 400

Invalid pagination query.

### HTTP 401

Invalid session.

### HTTP 404

Provider missing or unauthorized.

### HTTP 409

Missing or foreign continuation alias.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Platform administration or active membership of this Provider required. Canonical model-alias keyset order, 1–100 entries per page. Includes paused and unqualified drafts; does not activate an offer or establish commercial qualification. after must identify an existing offer of this Provider or returns 409. Follow next_after until null. Each page has one statement snapshot; multiple pages are not a frozen snapshot. No customer identities, requests, credentials or endpoint data. Dashboard offers remain a 1000-row preview with offers_has_more.

**Supported scope:** implemented
