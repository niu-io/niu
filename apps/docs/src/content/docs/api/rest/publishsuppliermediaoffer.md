---
title: "Save an inactive versioned media offer without text-token prices"
description: "POST /api/v1/providers/{provider}/media-offers"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/providers/{provider}/media-offers`

Installation write authority only. Requires exact current credential, model and syntactically validated video schema revisions plus explicit Provider ownership. Personal credentials and foreign aliases are rejected. Publication clears activation and offer qualification. Separate specification-selected purchase and customer selling cards are required for paid video dispatch. Exact receipt replay returns the saved revision without replacing a newer offer, including after configuration changes; a changed document or another Provider's receipt conflicts. Rebinding is allowed only to another credential explicitly owned by the same Provider, and original job routes/prices remain pinned. Neither a saved offer nor reviewed digests establish live protocol qualification.

Operation: `publishSupplierMediaOffer`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "operatorBearer": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/providers/{provider}/media-offers" \
  -H "Authorization: Bearer $NIU_MEMBER_TOKEN" \
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
    "model_alias",
    "vendor_id",
    "vendor_revision",
    "model_revision",
    "schema_revision"
  ],
  "properties": {
    "revision": {
      "type": "string",
      "format": "uuid",
      "description": "Client-owned immutable publication receipt. Reuse only for identical explicit replay."
    },
    "model_alias": {
      "type": "string",
      "minLength": 1,
      "maxLength": 256
    },
    "vendor_id": {
      "type": "string",
      "format": "uuid"
    },
    "vendor_revision": {
      "description": "Exact positive signed 64-bit revision; decimal strings preserve browser precision.",
      "oneOf": [
        {
          "type": "integer",
          "format": "int64",
          "minimum": 1
        },
        {
          "type": "string",
          "pattern": "^[1-9][0-9]{0,18}$",
          "maxLength": 19
        }
      ]
    },
    "model_revision": {
      "description": "Exact positive signed 64-bit revision; decimal strings preserve browser precision.",
      "oneOf": [
        {
          "type": "integer",
          "format": "int64",
          "minimum": 1
        },
        {
          "type": "string",
          "pattern": "^[1-9][0-9]{0,18}$",
          "maxLength": 19
        }
      ]
    },
    "schema_revision": {
      "type": "string",
      "minLength": 1,
      "maxLength": 256
    },
    "expected_revision": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid",
      "description": "Current offer revision, or null for a new offer."
    }
  }
}
```

## Responses

### HTTP 200

Inactive media offer saved or identical receipt replayed

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

Invalid model binding

### HTTP 401

Valid management session required

### HTTP 403

Installation write administration required

### HTTP 409

Changed receipt, stale binding, foreign ownership or offer revision conflict

### HTTP 413

Publication exceeds 4 KiB

### HTTP 422

Malformed JSON document or unexpected fields

### HTTP 503

Durable storage unavailable

## Behavior and supported scope

Installation write authority only. Requires exact current credential, model and syntactically validated video schema revisions plus explicit Provider ownership. Personal credentials and foreign aliases are rejected. Publication clears activation and offer qualification. Separate specification-selected purchase and customer selling cards are required for paid video dispatch. Exact receipt replay returns the saved revision without replacing a newer offer, including after configuration changes; a changed document or another Provider's receipt conflicts. Rebinding is allowed only to another credential explicitly owned by the same Provider, and original job routes/prices remain pinned. Neither a saved offer nor reviewed digests establish live protocol qualification.
