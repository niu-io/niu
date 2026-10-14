---
title: "Discover named customer accounts for platform financial administration"
description: "GET /admin/v1/platform/customer-accounts"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/platform/customer-accounts`

Explicit platform administration only, independent of ordinary company membership. Named companies and their current currency balance summaries; companies without accounts have an empty accounts array. No payment references, transactions, customer request content, Supplier costs or credentials. Shares customer balance arithmetic: available equals posted balance plus approved credit minus outstanding request liability. Approval is not a cash receipt. UUID references are routing-only, never display labels. Company UUID keyset order; limit defaults to 50, maximum 100 companies. Pass next_after unchanged as after; missing cursor returns 409. Each page has one bounded read snapshot, separate pages do not share it; concurrent inserts before the cursor require refreshing. No funds, accounts or policies are created. Cache-Control no-store.

Operation: `listPlatformCustomerAccounts`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/platform/customer-accounts" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

### after

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
  "default": 50
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Named company account page

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_after"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "organization_id",
          "organization_name",
          "accounts"
        ],
        "properties": {
          "organization_id": {
            "type": "string",
            "format": "uuid"
          },
          "organization_name": {
            "type": "string"
          },
          "accounts": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "currency",
                "balance_nanos",
                "reserved_nanos",
                "outstanding_nanos",
                "available_nanos",
                "credit_limit_nanos",
                "policy_revision",
                "warning_threshold_nanos",
                "low_balance",
                "posted_credit_exhausted"
              ],
              "properties": {
                "currency": {
                  "type": "string"
                },
                "balance_nanos": {
                  "type": "string"
                },
                "reserved_nanos": {
                  "type": "string"
                },
                "outstanding_nanos": {
                  "type": "string"
                },
                "available_nanos": {
                  "type": "string"
                },
                "credit_limit_nanos": {
                  "type": "string"
                },
                "policy_revision": {
                  "type": "string"
                },
                "warning_threshold_nanos": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "low_balance": {
                  "type": "boolean"
                },
                "posted_credit_exhausted": {
                  "type": "boolean"
                }
              }
            }
          }
        }
      }
    },
    "next_after": {
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

Invalid query or page size

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 409

Missing company cursor

## Behavior and supported scope

Explicit platform administration only, independent of ordinary company membership. Named companies and their current currency balance summaries; companies without accounts have an empty accounts array. No payment references, transactions, customer request content, Supplier costs or credentials. Shares customer balance arithmetic: available equals posted balance plus approved credit minus outstanding request liability. Approval is not a cash receipt. UUID references are routing-only, never display labels. Company UUID keyset order; limit defaults to 50, maximum 100 companies. Pass next_after unchanged as after; missing cursor returns 409. Each page has one bounded read snapshot, separate pages do not share it; concurrent inserts before the cursor require refreshing. No funds, accounts or policies are created. Cache-Control no-store.

**Supported scope:** implemented
