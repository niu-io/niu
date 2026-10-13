---
title: "Page current customer selling tariffs"
description: "GET /admin/v1/pricing/organizations/{organization}/workspaces/{project}/tariffs"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/pricing/organizations/{organization}/workspaces/{project}/tariffs`

Explicit platform administration required; ordinary company/workspace roles do not grant access. Configuration only, without usage, balances, statements, content, credentials or procurement. Keyset order is workspace UUID ascending for targets, model alias ascending for tariffs. Pass next_after unchanged as after; null means complete. Limit defaults to 50, maximum 100. Each page is one database snapshot; concurrent inserts before the cursor require refreshing the first page. Missing cursor returns 409. Identifiers are API references, never display labels. Cache-Control no-store. Tariff token rates are exact nanounits per million tokens; minimum and request fees are exact currency nanounits. Empty valid workspace returns an empty page.

Operation: `listPlatformCustomerTariffs`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/pricing/organizations/{organization}/workspaces/{project}/tariffs" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

### after

Location: **query**. Optional.

```json
{
  "type": "string"
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

## Request body

No request body is declared.

## Responses

### HTTP 200

Configuration page

Content type: `application/json`.

```json
{
  "type": "object",
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
        "required": [
          "model_alias",
          "revision",
          "currency",
          "created_at",
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
            "type": "string"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
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

Invalid query

### HTTP 401

Invalid management credential

### HTTP 403

Platform administration required

### HTTP 404

Company/workspace pair does not exist

### HTTP 409

Cursor absent from selected directory

### HTTP 503

Storage unavailable

## Behavior and supported scope

Explicit platform administration required; ordinary company/workspace roles do not grant access. Configuration only, without usage, balances, statements, content, credentials or procurement. Keyset order is workspace UUID ascending for targets, model alias ascending for tariffs. Pass next_after unchanged as after; null means complete. Limit defaults to 50, maximum 100. Each page is one database snapshot; concurrent inserts before the cursor require refreshing the first page. Missing cursor returns 409. Identifiers are API references, never display labels. Cache-Control no-store. Tariff token rates are exact nanounits per million tokens; minimum and request fees are exact currency nanounits. Empty valid workspace returns an empty page.

**Supported scope:** implemented
