---
title: "Publish an immutable agreed Supplier payout schedule"
description: "POST /admin/v1/providers/{provider}/offers"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/providers/{provider}/offers`

Installation-only publication binds an existing vendor model alias to one Supplier. Decimal prices are currency nanounits per million tokens. Existing attempts retain the revision pinned before dispatch. Stale expected_revision and incompatible vendor ownership conflict. Initial creation requires null expected_revision. Optional category rates price reported subsets separately; null uses ordinary rates. Omitting an existing category rate or tier schedule conflicts. Empty context_tiers clears the schedule; null is rejected. The highest inclusive threshold on aggregate input (including cache reads/writes) selects a complete schedule; category null within a tier does not inherit its base category rate. Missing required quantities leave earnings unresolved. Every publication pauses the offer and requires renewed qualification. Procurement budgets and customer charges remain independent.

Operation: `publishProviderPayoutRates`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/providers/{provider}/offers" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "model_alias",
    "currency",
    "prompt_rate",
    "completion_rate",
    "expected_revision"
  ],
  "properties": {
    "model_alias": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "currency": {
      "type": "string",
      "pattern": "^[A-Z]{3}$"
    },
    "prompt_rate": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Currency nanounits per million tokens; maximum 1000000000000000."
    },
    "completion_rate": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Currency nanounits per million tokens; maximum 1000000000000000."
    },
    "expected_revision": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
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
    "cached_prompt_rate": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$",
      "description": "Currency nanounits per million tokens; maximum 1000000000000000."
    },
    "cache_write_prompt_rate": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$",
      "description": "Currency nanounits per million tokens; maximum 1000000000000000."
    },
    "reasoning_completion_rate": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$",
      "description": "Currency nanounits per million tokens; maximum 1000000000000000."
    }
  }
}
```

## Responses

### HTTP 200

New immutable revision

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "required": [
        "revision"
      ],
      "properties": {
        "revision": {
          "type": "string",
          "format": "uuid"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid prices or tier thresholds

### HTTP 403

Installation administration required

### HTTP 409

Ownership, expected revision, or omitted current schedule conflict

### HTTP 422

JSON schema mismatch; context_tiers must be an array, never null

## Behavior and supported scope

Installation-only publication binds an existing vendor model alias to one Supplier. Decimal prices are currency nanounits per million tokens. Existing attempts retain the revision pinned before dispatch. Stale expected_revision and incompatible vendor ownership conflict. Initial creation requires null expected_revision. Optional category rates price reported subsets separately; null uses ordinary rates. Omitting an existing category rate or tier schedule conflicts. Empty context_tiers clears the schedule; null is rejected. The highest inclusive threshold on aggregate input (including cache reads/writes) selects a complete schedule; category null within a tier does not inherit its base category rate. Missing required quantities leave earnings unresolved. Every publication pauses the offer and requires renewed qualification. Procurement budgets and customer charges remain independent.

**Supported scope:** implemented
