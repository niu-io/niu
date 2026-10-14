---
title: "List immutable Provider quote history"
description: "GET /admin/v1/providers/{provider}/offers/{offer}/revisions"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/providers/{provider}/offers/{offer}/revisions`

Installation administration or active membership in this Provider is required. Company ownership does not grant procurement access. Newest first by created_at and revision UUID with exclusive keyset pagination, not commit order. One statement snapshot keeps each page and current pointer coherent; separate pages do not share a snapshot. New publications appear on a fresh first page. A foreign or missing cursor returns 409; a missing or inaccessible Provider/offer returns 404. Text prices are exact nanounits per million tokens; media text prices are null and use separate media rate cards. No credentials, endpoints or customer prices. Reading does not qualify, activate or reprice offers. Internal identifiers are API references, not UI labels.

Operation: `listProviderOfferHistory`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/providers/{provider}/offers/{offer}/revisions" \
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

### before

Location: **query**. Optional.

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

Bounded historical procurement page.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
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
      "items": {
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
              "is_current",
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
              "is_current": {
                "type": "boolean"
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
              "is_current",
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
              "is_current": {
                "type": "boolean"
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

Invalid query, limit or path.

### HTTP 401

Management authentication required.

### HTTP 404

Provider membership denied or offer not found.

### HTTP 409

Cursor does not belong to this offer.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Installation administration or active membership in this Provider is required. Company ownership does not grant procurement access. Newest first by created_at and revision UUID with exclusive keyset pagination, not commit order. One statement snapshot keeps each page and current pointer coherent; separate pages do not share a snapshot. New publications appear on a fresh first page. A foreign or missing cursor returns 409; a missing or inaccessible Provider/offer returns 404. Text prices are exact nanounits per million tokens; media text prices are null and use separate media rate cards. No credentials, endpoints or customer prices. Reading does not qualify, activate or reprice offers. Internal identifiers are API references, not UI labels.

**Supported scope:** implemented
