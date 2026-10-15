---
title: "Page Provider settlement history"
description: "GET /api/v1/providers/{provider}/settlements"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/providers/{provider}/settlements`

Platform administration or active membership of this Provider required. Lists immutable records of externally confirmed payments; does not initiate payment or claim a bank balance. Ordered by created_at then id descending, with 1–100 rows per page. All amounts are exact currency nanounit strings. No customer, workspace, request, attempt, credential, or procurement detail is included. Time range is from_ms-inclusive and to_ms-exclusive (Unix milliseconds). Keep filters fixed while following next_cursor; a cursor outside this Provider or the filters returns 409. Inserts newer than the cursor do not shift later pages; pages do not constitute a frozen multi-request snapshot. All responses are no-store. Existing POST recording semantics are unchanged.

Operation: `listProviderSettlements`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/providers/{provider}/settlements" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
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

Settlement page; null next_cursor means the end.

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
          "currency",
          "amount_nanos",
          "payment_reference",
          "created_at"
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
          "payment_reference": {
            "type": "string"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
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

Unsupported administrative authority.

### HTTP 404

Provider not found or membership unavailable.

### HTTP 409

Cursor not in this Provider and filter scope.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Platform administration or active membership of this Provider required. Lists immutable records of externally confirmed payments; does not initiate payment or claim a bank balance. Ordered by created_at then id descending, with 1–100 rows per page. All amounts are exact currency nanounit strings. No customer, workspace, request, attempt, credential, or procurement detail is included. Time range is from_ms-inclusive and to_ms-exclusive (Unix milliseconds). Keep filters fixed while following next_cursor; a cursor outside this Provider or the filters returns 409. Inserts newer than the cursor do not shift later pages; pages do not constitute a frozen multi-request snapshot. All responses are no-store. Existing POST recording semantics are unchanged.

**Supported scope:** implemented
