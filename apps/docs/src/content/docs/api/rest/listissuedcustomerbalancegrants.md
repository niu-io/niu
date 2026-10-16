---
title: "List issued noncash gifts and corrections"
description: "GET /api/v1/organizations/{organization}/billing/accounts/{currency}/grants/issued"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/billing/accounts/{currency}/grants/issued`

Platform-only immutable gift history, including gifts predating durable preparation. Original issuance remains unchanged; correction is separate. Ordered by immutable creation time and reference. Follow next_before; no mutation or automatic retry. Reasons and actor labels remain platform-only. Internal references are routing metadata, never product labels.

Operation: `listIssuedCustomerBalanceGrants`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/accounts/{currency}/grants/issued" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
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

### currency

Location: **path**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
}
```

### before

Location: **query**. Optional.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 25
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Issued gifts and their correction, if any

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_before"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "amount_nanos",
          "reason",
          "created_at",
          "currency",
          "correction"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "amount_nanos": {
            "type": "string",
            "pattern": "^[1-9][0-9]{0,18}$"
          },
          "reason": {
            "type": "string"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "currency": {
            "type": "string"
          },
          "correction": {
            "type": [
              "object",
              "null"
            ],
            "required": [
              "id",
              "amount_nanos",
              "reason",
              "created_at",
              "actor_kind",
              "actor_label"
            ],
            "properties": {
              "id": {
                "type": "string",
                "format": "uuid"
              },
              "amount_nanos": {
                "type": "string",
                "pattern": "^[1-9][0-9]{0,18}$"
              },
              "reason": {
                "type": "string"
              },
              "created_at": {
                "type": "string",
                "format": "date-time"
              },
              "actor_kind": {
                "type": "string",
                "enum": [
                  "installation",
                  "operator"
                ]
              },
              "actor_label": {
                "type": "string"
              }
            }
          }
        }
      }
    },
    "next_before": {
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

Invalid currency or page size

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 409

Cursor is unavailable or out of scope

## Behavior and supported scope

Platform-only immutable gift history, including gifts predating durable preparation. Original issuance remains unchanged; correction is separate. Ordered by immutable creation time and reference. Follow next_before; no mutation or automatic retry. Reasons and actor labels remain platform-only. Internal references are routing metadata, never product labels.

**Supported scope:** implemented
