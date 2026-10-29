---
title: "Read named qualified commercial video configuration choices"
description: "GET /api/v1/organizations/{organization}/billing/media-rate-models"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/billing/media-rate-models`

Platform-administrator read permission required. Installation credentials and explicitly granted member administrators are supported. Lists currently active, qualified, nonpersonal routes with exact credential/model/offer/schema bindings. No credentials, endpoints, purchase prices or customer charges. Cursor advances over raw model aliases even when invalid schemas are omitted; empty pages can therefore have a continuation. Choices do not authorize dispatch or guarantee later availability.

Operation: `listCustomerMediaRateModels`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/media-rate-models" \
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

### after

Location: **query**. Optional.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 256
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

Bounded current choices

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "has_more",
    "next_after"
  ],
  "properties": {
    "has_more": {
      "type": "boolean"
    },
    "next_after": {
      "type": [
        "string",
        "null"
      ]
    },
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "model_alias",
          "api_key_name",
          "vendor_id",
          "offer_revision",
          "vendor_revision",
          "model_revision",
          "schema_revision",
          "channel",
          "resolutions",
          "reference_video"
        ],
        "properties": {
          "model_alias": {
            "type": "string"
          },
          "api_key_name": {
            "type": "string"
          },
          "vendor_id": {
            "type": "string",
            "format": "uuid",
            "description": "Internal configuration binding; never a display label."
          },
          "offer_revision": {
            "type": "string",
            "format": "uuid"
          },
          "vendor_revision": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "model_revision": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "schema_revision": {
            "type": "string"
          },
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
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid cursor or page size

### HTTP 401

Administrator authentication required

### HTTP 403

Platform-administrator read permission required

### HTTP 503

Durable storage unavailable

## Behavior and supported scope

Platform-administrator read permission required. Installation credentials and explicitly granted member administrators are supported. Lists currently active, qualified, nonpersonal routes with exact credential/model/offer/schema bindings. No credentials, endpoints, purchase prices or customer charges. Cursor advances over raw model aliases even when invalid schemas are omitted; empty pages can therefore have a continuation. Choices do not authorize dispatch or guarantee later availability.

**Supported scope:** implemented
