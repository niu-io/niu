---
title: "List registered shared models for standard-price preparation"
description: "GET /api/v1/pricing/standard-prices/models"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/pricing/standard-prices/models`

Explicit platform administration required. Includes registered nonpersonal vendor aliases and route-pool aliases even when disabled. Matches standard-price registration eligibility, not legacy workspace tariff availability. Personal vendor aliases are excluded. Validated video output configuration adds media choices (channel, resolutions, reference-video support and meter); absent, invalid or stale configuration returns media null. Registration is not qualified supply, customer selling eligibility or dispatch readiness. No credentials, upstream mappings or procurement prices. Sorted alias keyset; default 50, maximum 100. Pass next_after unchanged; unavailable cursor returns 409. Cursor and page share one database snapshot. Cache-Control no-store.

Operation: `listRegisteredRetailModels`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/pricing/standard-prices/models" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
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

Registered alias page, including disabled configuration

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
          },
          "media": {
            "type": [
              "object",
              "null"
            ],
            "additionalProperties": false,
            "required": [
              "channel",
              "resolutions",
              "reference_video",
              "meter"
            ],
            "properties": {
              "channel": {
                "type": "string"
              },
              "resolutions": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "reference_video": {
                "type": "boolean"
              },
              "meter": {
                "type": "string"
              }
            }
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

Cursor no longer registered; restart pagination

## Behavior and supported scope

Explicit platform administration required. Includes registered nonpersonal vendor aliases and route-pool aliases even when disabled. Matches standard-price registration eligibility, not legacy workspace tariff availability. Personal vendor aliases are excluded. Validated video output configuration adds media choices (channel, resolutions, reference-video support and meter); absent, invalid or stale configuration returns media null. Registration is not qualified supply, customer selling eligibility or dispatch readiness. No credentials, upstream mappings or procurement prices. Sorted alias keyset; default 50, maximum 100. Pass next_after unchanged; unavailable cursor returns 409. Cursor and page share one database snapshot. Cache-Control no-store.

**Supported scope:** implemented
