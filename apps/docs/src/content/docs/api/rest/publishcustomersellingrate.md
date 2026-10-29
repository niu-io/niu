---
title: "Publish an immutable customer selling rate revision"
description: "POST /api/v1/organizations/{organization}/projects/{project}/billing/tariffs"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/projects/{project}/billing/tariffs`

Installation administration or an explicitly granted platform administrator required. Ordinary company/workspace owners cannot set selling prices. Personal owner-funded models do not accept customer tariffs, even when callable by their owner. This does not grant invoice, payment or credit-policy writes. Rates are currency nanounits per million text tokens, bounded at 1000000000000000. Optional cached_prompt_rate independently prices reported cached input. Null selects flat input pricing. When replacing an existing cached tariff this field must be explicit; omission conflicts. Missing cached usage keeps charges unresolved. No retroactive billing. Cache-Control is no-store. Optional reasoning_completion_rate prices the reported reasoning subset of completion tokens without double counting. Null selects flat output pricing. Replacing a separately priced reasoning tariff requires an explicit rate or null; omission conflicts. Unknown reasoning quantity leaves the charge unresolved. Admission bounds use the larger ordinary/reasoning output rate. Provider procurement rates remain independent. Optional discount_baseline_revision publishes explicit discounted rates against an immutable original revision for the same model and currency. Missing or already discounted baselines, increased rates, changed category presence or context thresholds return 409. No runtime multiplier or historical repricing.

Operation: `publishCustomerSellingRate`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/billing/tariffs" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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
    "completion_rate"
  ],
  "properties": {
    "model_alias": {
      "type": "string",
      "maxLength": 200
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
    "minimum_charge_nanos": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Minimum customer charge in currency nanounits (0 to 9223372036854775807), not a token rate. Defaults to zero for new tariffs. Replacing a nonzero minimum requires an explicit value; zero disables it. Known completed usage is charged the greater of the rounded token amount plus request_fee_nanos and this minimum. Unknown usage remains unresolved."
    },
    "cached_prompt_rate": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$",
      "description": "Optional cache-read rate with the same unit and maximum as prompt_rate."
    },
    "expected_revision": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    },
    "request_fee_nanos": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Customer-only fixed fee in currency nanounits (0 to 9223372036854775807). Charge = max(rounded token charge + request fee, minimum charge) for known completed usage. Unknown execution/usage and confirmed rejection do not create a fee. Defaults to zero on new tariffs; replacement of a nonzero fee requires an explicit value; zero disables it."
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
    "discount_baseline_revision": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid",
      "description": "Original selling-price revision for an explicit discount. API reference only; never a UI label. Resulting rates, currency, category presence and context thresholds are checked against the original. Existing requests retain their pinned revision."
    }
  }
}
```

## Responses

### HTTP 200

Published immutable customer tariff revision

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

Invalid rates, currency or unavailable model alias

### HTTP 401

Invalid or expired administrative credential.

### HTTP 403

Installation administration or explicit platform grant required

### HTTP 409

Stale expected revision

### HTTP 422

Request fields do not match the JSON schema; context_tiers must be an array, never null.

## Behavior and supported scope

Installation administration or an explicitly granted platform administrator required. Ordinary company/workspace owners cannot set selling prices. Personal owner-funded models do not accept customer tariffs, even when callable by their owner. This does not grant invoice, payment or credit-policy writes. Rates are currency nanounits per million text tokens, bounded at 1000000000000000. Optional cached_prompt_rate independently prices reported cached input. Null selects flat input pricing. When replacing an existing cached tariff this field must be explicit; omission conflicts. Missing cached usage keeps charges unresolved. No retroactive billing. Cache-Control is no-store. Optional reasoning_completion_rate prices the reported reasoning subset of completion tokens without double counting. Null selects flat output pricing. Replacing a separately priced reasoning tariff requires an explicit rate or null; omission conflicts. Unknown reasoning quantity leaves the charge unresolved. Admission bounds use the larger ordinary/reasoning output rate. Provider procurement rates remain independent. Optional discount_baseline_revision publishes explicit discounted rates against an immutable original revision for the same model and currency. Missing or already discounted baselines, increased rates, changed category presence or context thresholds return 409. No runtime multiplier or historical repricing.

**Supported scope:** implemented
