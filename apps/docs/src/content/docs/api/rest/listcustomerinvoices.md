---
title: "Page complete workspace customer invoice history"
description: "GET /api/v1/organizations/{organization}/projects/{project}/billing/invoices"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/billing/invoices`

Requires administrative read permission for this workspace. Returns customer billing only, with exact amount strings. Records are ordered by creation time then id descending. Posted customer balance debits, including approved-credit debits, settle the invoice; they are not a new unpaid invoice debt. Refunds do not reopen the original invoice obligation. Reads do not create payment receipts, move funds or disclose Provider purchase prices. A cursor missing from this workspace or filter scope returns 409. Newer inserts do not shift later pages; separate reads are not a frozen snapshot. Cache-Control is no-store. Existing invoice issuance and line reads are unchanged.

Operation: `listCustomerInvoices`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/billing/invoices" \
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

### project

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### before

Location: **query**. Optional. Prior next_cursor. Keep filters fixed across pages.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### currency

Location: **query**. Optional. One currency; no conversion.

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
}
```

### from_ms

Location: **query**. Optional. Inclusive invoice creation time, Unix milliseconds; not the billed usage interval.

```json
{
  "type": "integer",
  "format": "int64",
  "minimum": 0,
  "maximum": 253402300799999
}
```

### to_ms

Location: **query**. Optional. Exclusive invoice creation time; must follow from_ms.

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

Customer invoice page; null next_cursor marks the end.

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
          "from_ms",
          "to_ms",
          "currency",
          "amount_nanos",
          "created_at",
          "status",
          "payment_reference"
        ],
        "additionalProperties": false,
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "from_ms": {
            "type": "integer",
            "format": "int64"
          },
          "to_ms": {
            "type": "integer",
            "format": "int64"
          },
          "currency": {
            "type": "string"
          },
          "amount_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "status": {
            "type": "string",
            "enum": [
              "issued",
              "paid"
            ]
          },
          "payment_reference": {
            "type": [
              "string",
              "null"
            ]
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

Invalid query.

### HTTP 401

Invalid administrative credential.

### HTTP 404

Workspace absent or inaccessible.

### HTTP 409

Cursor outside workspace or filters.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Requires administrative read permission for this workspace. Returns customer billing only, with exact amount strings. Records are ordered by creation time then id descending. Posted customer balance debits, including approved-credit debits, settle the invoice; they are not a new unpaid invoice debt. Refunds do not reopen the original invoice obligation. Reads do not create payment receipts, move funds or disclose Provider purchase prices. A cursor missing from this workspace or filter scope returns 409. Newer inserts do not shift later pages; separate reads are not a frozen snapshot. Cache-Control is no-store. Existing invoice issuance and line reads are unchanged.

**Supported scope:** implemented
