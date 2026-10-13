---
title: "Read shared company account balances"
description: "GET /admin/v1/organizations/{organization}/billing/balance"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/billing/balance`

Requires organization-wide owner/admin access or installation administration. Workspace-only sessions and organization viewers cannot read shared funds. Exact nanounit amounts are decimal strings. Available funds equal posted balance plus approved credit minus outstanding liabilities (including known media charges above their original holds); each request must still atomically reserve its full liability. No account identifiers, Supplier prices or payment references are exposed. Storage reads retain one amount snapshot with transaction-local 250 ms lock and 2 s statement limits. Timeout returns sanitized 503, never zero balances or partial success; pool admission and a complete HTTP deadline remain separate.

Operation: `getCustomerBalance`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/billing/balance" \
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

## Request body

No request body is declared.

## Responses

### HTTP 200

Customer balance summaries by currency

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
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
          "warning_threshold_nanos",
          "policy_revision",
          "low_balance",
          "posted_credit_exhausted"
        ],
        "properties": {
          "currency": {
            "type": "string",
            "pattern": "^[A-Z]{3}$"
          },
          "balance_nanos": {
            "type": "string",
            "pattern": "^-?[0-9]+$"
          },
          "reserved_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "outstanding_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$",
            "description": "Open customer liabilities, including known media charges above their original holds, excluding already posted debits."
          },
          "available_nanos": {
            "type": "string",
            "pattern": "^-?[0-9]+$",
            "description": "Posted balance plus approved credit minus outstanding_nanos; may be negative."
          },
          "credit_limit_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "policy_revision": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "warning_threshold_nanos": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$"
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
```

### HTTP 401

Authentication required

### HTTP 404

Company account access not granted

## Behavior and supported scope

Requires organization-wide owner/admin access or installation administration. Workspace-only sessions and organization viewers cannot read shared funds. Exact nanounit amounts are decimal strings. Available funds equal posted balance plus approved credit minus outstanding liabilities (including known media charges above their original holds); each request must still atomically reserve its full liability. No account identifiers, Supplier prices or payment references are exposed. Storage reads retain one amount snapshot with transaction-local 250 ms lock and 2 s statement limits. Timeout returns sanitized 503, never zero balances or partial success; pool admission and a complete HTTP deadline remain separate.

**Supported scope:** implemented
