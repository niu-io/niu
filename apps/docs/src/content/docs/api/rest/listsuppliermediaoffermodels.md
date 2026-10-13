---
title: "List named draft media offer bindings"
description: "GET /admin/v1/providers/{provider}/media-offer-models"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/providers/{provider}/media-offer-models`

Installation read authority only. Bounded canonical alias traversal includes configured video schemas on explicitly owned Supplier credentials, regardless of activation or qualification. Invalid schemas, personal credentials and aliases owned by another Supplier are excluded. No credential, endpoint, upstream model or prices are returned. Exact revision strings and internal binding identifiers must remain out of product UI. Cursor progression includes invalid rows skipped after validation. A page may have empty data with has_more true; clients must continue with next_after until has_more is false. Multiple credentials belonging to the same Supplier retain their independent model bindings.

Operation: `listSupplierMediaOfferModels`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/providers/{provider}/media-offer-models"
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

Draft configuration choices, not dispatch qualification

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
          "vendor_id",
          "vendor_revision",
          "model_revision",
          "schema_revision",
          "channel",
          "offer_revision"
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
          "offer_revision": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
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

Installation read authority only. Bounded canonical alias traversal includes configured video schemas on explicitly owned Supplier credentials, regardless of activation or qualification. Invalid schemas, personal credentials and aliases owned by another Supplier are excluded. No credential, endpoint, upstream model or prices are returned. Exact revision strings and internal binding identifiers must remain out of product UI. Cursor progression includes invalid rows skipped after validation. A page may have empty data with has_more true; clients must continue with next_after until has_more is false. Multiple credentials belonging to the same Supplier retain their independent model bindings.
