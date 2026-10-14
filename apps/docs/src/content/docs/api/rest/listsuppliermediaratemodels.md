---
title: "List current media pricing configuration choices"
description: "GET /admin/v1/providers/{provider}/media-rate-models"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/providers/{provider}/media-rate-models`

Installation read authority only. Named model and API-key choices include current qualified active offer bindings and syntactically validated media-schema constraints. This does not qualify dispatch protocols or provide prices. Disabled routes, personal credentials, invalid schemas and foreign Providers are excluded. Revisions remain exact strings; clients keep binding identifiers out of product UI and publication rechecks current state. Cursor ordering uses model alias, including rows skipped for invalid schemas.

Operation: `listSupplierMediaRateModels`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/providers/{provider}/media-rate-models"
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

Bounded configuration choices

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
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
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "model_alias",
          "api_key_name",
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
          "offer_revision": {
            "type": "string",
            "format": "uuid"
          },
          "vendor_revision": {
            "type": "string",
            "pattern": "^[1-9][0-9]*$"
          },
          "model_revision": {
            "type": "string",
            "pattern": "^[1-9][0-9]*$"
          },
          "schema_revision": {
            "type": "string"
          },
          "channel": {
            "type": "string"
          },
          "resolutions": {
            "type": "array",
            "maxItems": 64,
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

Valid management session required

### HTTP 403

Installation administration required

### HTTP 503

Durable storage unavailable

## Behavior and supported scope

Installation read authority only. Named model and API-key choices include current qualified active offer bindings and syntactically validated media-schema constraints. This does not qualify dispatch protocols or provide prices. Disabled routes, personal credentials, invalid schemas and foreign Providers are excluded. Revisions remain exact strings; clients keep binding identifiers out of product UI and publication rechecks current state. Cursor ordering uses model alias, including rows skipped for invalid schemas.
