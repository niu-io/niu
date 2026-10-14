---
title: "Page platform Provider accrued and paid obligations"
description: "GET /admin/v1/providers/{provider}/earnings"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/providers/{provider}/earnings`

Platform administration required; Provider membership and company ownership do not grant access. Full retained earning history, creation time descending then attempt ID ascending, using the existing ledger index. Exact amount strings; no customer identity, workspace, credential or customer selling price. The id is an internal selection value for the existing settlement POST, never a display label. A page is one database snapshot; settlement status may change between requests and settlement writes revalidate unpaid selections. Reads do not create earnings or payments. Missing or out-of-filter cursors return 409. Cache-Control no-store.

Operation: `listProviderEarnings`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/providers/{provider}/earnings" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
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

### before

Location: **query**. Optional. Prior next_cursor; omit for the first page.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### currency

Location: **query**. Optional. Filter one currency without conversion.

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
}
```

### from_ms

Location: **query**. Optional. Inclusive payment-record creation time. Unix milliseconds.

```json
{
  "type": "integer",
  "format": "int64",
  "minimum": 0,
  "maximum": 253402300799999
}
```

### to_ms

Location: **query**. Optional. Exclusive payment-record creation time; must follow from. Unix milliseconds.

```json
{
  "type": "integer",
  "format": "int64",
  "minimum": 0,
  "maximum": 253402300799999
}
```

### limit

Location: **query**. Optional. Maximum page size.

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

Provider earning page; next_cursor null ends traversal.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_cursor"
  ],
  "additionalProperties": false,
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "model_alias",
          "currency",
          "amount_nanos",
          "billing_meter",
          "created_at",
          "status",
          "revision",
          "offer_id",
          "context_minimum_input_tokens",
          "prompt_tokens",
          "completion_tokens",
          "cached_prompt_tokens",
          "cache_write_prompt_tokens",
          "reasoning_completion_tokens"
        ],
        "additionalProperties": false,
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "currency": {
            "type": "string",
            "pattern": "^[A-Z]{3}$"
          },
          "amount_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "model_alias": {
            "type": "string"
          },
          "billing_meter": {
            "type": "string"
          },
          "status": {
            "type": "string",
            "enum": [
              "accrued",
              "paid"
            ]
          },
          "revision": {
            "type": "string",
            "format": "uuid"
          },
          "offer_id": {
            "type": "string",
            "format": "uuid"
          },
          "context_minimum_input_tokens": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$"
          },
          "prompt_tokens": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$"
          },
          "completion_tokens": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$"
          },
          "cached_prompt_tokens": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$"
          },
          "cache_write_prompt_tokens": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$"
          },
          "reasoning_completion_tokens": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$"
          }
        }
      }
    },
    "next_cursor": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    }
  }
}
```

### HTTP 400

Invalid filters, range or page size.

### HTTP 401

Invalid credential.

### HTTP 403

Platform administration required, including for Provider members.

### HTTP 404

Provider does not exist or is deleted.

### HTTP 409

Cursor not in this Provider and filter scope.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Platform administration required; Provider membership and company ownership do not grant access. Full retained earning history, creation time descending then attempt ID ascending, using the existing ledger index. Exact amount strings; no customer identity, workspace, credential or customer selling price. The id is an internal selection value for the existing settlement POST, never a display label. A page is one database snapshot; settlement status may change between requests and settlement writes revalidate unpaid selections. Reads do not create earnings or payments. Missing or out-of-filter cursors return 409. Cache-Control no-store.

**Supported scope:** implemented
