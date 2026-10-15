---
title: "List models eligible for customer tariff publication"
description: "GET /api/v1/pricing/models"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/pricing/models`

Explicit platform administration required. Uses the same shared catalog as customer tariff publication, excluding personal owner-funded and unavailable aliases. This is a current eligibility read, not a price, supply qualification or dispatch guarantee. Publication rechecks eligibility. Sorted by model alias; limit defaults to 50, maximum 100. Pass next_after unchanged; null means complete. An unavailable cursor returns 409: restart pagination. No credentials, upstream mappings or procurement prices. Cache-Control no-store.

Operation: `listPlatformPricingModels`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/pricing/models" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
```

## Parameters

### after

Location: **query**. Optional.

```json
{
  "type": "string",
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
  "default": 50
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Current eligible alias page

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
          "model_alias"
        ],
        "properties": {
          "model_alias": {
            "type": "string"
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

Invalid page size or alias cursor

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 409

Cursor no longer eligible; restart pagination

## Behavior and supported scope

Explicit platform administration required. Uses the same shared catalog as customer tariff publication, excluding personal owner-funded and unavailable aliases. This is a current eligibility read, not a price, supply qualification or dispatch guarantee. Publication rechecks eligibility. Sorted by model alias; limit defaults to 50, maximum 100. Pass next_after unchanged; null means complete. An unavailable cursor returns 409: restart pagination. No credentials, upstream mappings or procurement prices. Cache-Control no-store.

**Supported scope:** implemented
