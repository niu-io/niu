---
title: "Issue an immutable itemized usage statement"
description: "POST /admin/v1/organizations/{organization}/projects/{project}/billing/invoices"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/organizations/{organization}/projects/{project}/billing/invoices`

Installation only. Half-open UTC dispatch interval [from_ms, to_ms), maximum 366 days, one currency. Includes text and media charges. Rejects unresolved priced usage, unsettled media balance debits, overlapping periods and empty periods. Exact idempotent retries return the same invoice. Does not collect money or calculate tax. Cache-Control is no-store.

Operation: `issueCustomerUsageInvoice`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/billing/invoices" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "from_ms",
    "to_ms",
    "currency",
    "idempotency_key"
  ],
  "properties": {
    "from_ms": {
      "type": "integer",
      "format": "int64",
      "minimum": 0
    },
    "to_ms": {
      "type": "integer",
      "format": "int64"
    },
    "currency": {
      "type": "string",
      "pattern": "^[A-Z]{3}$"
    },
    "idempotency_key": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

## Responses

### HTTP 200

Invoice identity, including an exact idempotent replay

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
        "id"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid period or currency

### HTTP 401

Invalid or expired administrative credential.

### HTTP 403

Installation authority required

### HTTP 404

Workspace outside authorized scope.

### HTTP 409

Unresolved usage, overlapping or empty period, or changed idempotency payload

## Behavior and supported scope

Installation only. Half-open UTC dispatch interval [from_ms, to_ms), maximum 366 days, one currency. Includes text and media charges. Rejects unresolved priced usage, unsettled media balance debits, overlapping periods and empty periods. Exact idempotent retries return the same invoice. Does not collect money or calculate tax. Cache-Control is no-store.

**Supported scope:** implemented
