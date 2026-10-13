---
title: "Read a company balance transaction page"
description: "GET /admin/v1/organizations/{organization}/billing/transactions"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/billing/transactions`

Organization-wide owner/admin or installation access required. Customer ledger only; no Supplier costs or margins. Ordered by descending recorded time and internal reference. UUIDs are API routing references and must not be displayed as product labels. Each page contains up to 100 entries; next_cursor is null at the end. Pass the cursor as before to read older entries. Unknown or foreign cursors return a conflict. Traversal is a live view, not a fixed export snapshot; newly inserted later entries appear on refresh. Optional currency and kind filters apply before pagination. Keep filters fixed while following cursors; out-of-filter cursors return 409. Each page and cursor check share one database snapshot.

Operation: `getCustomerBalanceTransactions`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/billing/transactions" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
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

### before

Location: **query**. Optional. next_cursor returned by the previous page. Must belong to this company.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### currency

Location: **query**. Optional.

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
}
```

### kind

Location: **query**. Optional.

```json
{
  "type": "string",
  "enum": [
    "funding",
    "charge",
    "refund",
    "funding_reversal",
    "adjustment"
  ]
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Customer balance entries

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_cursor"
  ],
  "properties": {
    "next_cursor": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    },
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "kind": {
            "type": "string",
            "enum": [
              "funding",
              "charge",
              "refund",
              "funding_reversal",
              "adjustment"
            ]
          },
          "currency": {
            "type": "string",
            "pattern": "^[A-Z]{3}$"
          },
          "amount_nanos": {
            "type": "string",
            "pattern": "^-?[0-9]+$"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "reverses_entry_id": {
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

Invalid currency, entry kind or query

### HTTP 401

Authentication required

### HTTP 404

Company account access not granted

### HTTP 409

Cursor does not belong to this company ledger

## Behavior and supported scope

Organization-wide owner/admin or installation access required. Customer ledger only; no Supplier costs or margins. Ordered by descending recorded time and internal reference. UUIDs are API routing references and must not be displayed as product labels. Each page contains up to 100 entries; next_cursor is null at the end. Pass the cursor as before to read older entries. Unknown or foreign cursors return a conflict. Traversal is a live view, not a fixed export snapshot; newly inserted later entries appear on refresh. Optional currency and kind filters apply before pagination. Keep filters fixed while following cursors; out-of-filter cursors return 409. Each page and cursor check share one database snapshot.

**Supported scope:** implemented
