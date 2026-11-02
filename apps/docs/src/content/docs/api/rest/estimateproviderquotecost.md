---
title: "Estimate supplied billable quantities against an immutable quote"
description: "POST /api/v1/providers/{provider}/estimate"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/providers/{provider}/estimate`

Platform administration required. Read-only calculation: no inference or billing mutation. model is the upstream ID, revision is a captured quote version, quantities are disjoint billable meters (uncached input must exclude cached tokens). Exact decimal arithmetic; unsupported/unknown/overflowing meters remain explicit and never imply zero. Conditional quotes require an explicit matching condition from the captured evidence; no time or holiday calendar is guessed. Separate currency totals and partial coverage are retained. This is not an actual Provider invoice or a Niu customer charge.

Operation: `estimateProviderQuoteCost`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/providers/{provider}/estimate" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "revision",
    "model",
    "quantities"
  ],
  "properties": {
    "revision": {
      "type": "string",
      "pattern": "^[1-9][0-9]*$"
    },
    "model": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "quantities": {
      "type": "array",
      "minItems": 1,
      "maxItems": 32,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "meter",
          "units"
        ],
        "properties": {
          "meter": {
            "type": "string",
            "minLength": 1,
            "maxLength": 80
          },
          "units": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "condition": {
            "type": "string",
            "minLength": 1,
            "maxLength": 80
          }
        }
      }
    }
  }
}
```

## Responses

### HTTP 200

Quote-bound estimate with currency totals and unknown coverage.

## Behavior and supported scope

Platform administration required. Read-only calculation: no inference or billing mutation. model is the upstream ID, revision is a captured quote version, quantities are disjoint billable meters (uncached input must exclude cached tokens). Exact decimal arithmetic; unsupported/unknown/overflowing meters remain explicit and never imply zero. Conditional quotes require an explicit matching condition from the captured evidence; no time or holiday calendar is guessed. Separate currency totals and partial coverage are retained. This is not an actual Provider invoice or a Niu customer charge.

**Supported scope:** implemented
