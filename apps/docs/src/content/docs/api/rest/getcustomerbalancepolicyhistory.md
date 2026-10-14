---
title: "Read immutable company credit and warning policy revisions"
description: "GET /admin/v1/organizations/{organization}/billing/accounts/{currency}/policy/history"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/billing/accounts/{currency}/policy/history`

Organization-wide owner/admin or installation administration required, using the same authorization as company balance reads. Workspace-only sessions and company viewers cannot read shared financial policy. No account IDs, payment references or Provider prices. Exact amounts and revisions are decimal strings. Revision-descending keyset pages use one database snapshot per request; separate pages do not share a snapshot. Missing currency account returns 404; missing revision cursor returns 409. Revision zero with empty history denotes an account with no policy writes. This read does not change funds or credit. Cache-Control no-store.

Operation: `getCustomerBalancePolicyHistory`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/billing/accounts/{currency}/policy/history" \
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

### currency

Location: **path**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
}
```

### before

Location: **query**. Optional. Exclusive existing revision cursor.

```json
{
  "type": "string",
  "pattern": "^[1-9][0-9]*$"
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

Current revision and history page

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "current_revision",
    "data",
    "next_before"
  ],
  "properties": {
    "current_revision": {
      "type": "string",
      "pattern": "^[0-9]+$"
    },
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "revision",
          "credit_limit_nanos",
          "warning_threshold_nanos",
          "created_at",
          "is_current"
        ],
        "properties": {
          "revision": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "credit_limit_nanos": {
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
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "is_current": {
            "type": "boolean"
          }
        },
        "additionalProperties": false
      }
    },
    "next_before": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[1-9][0-9]*$"
    }
  }
}
```

### HTTP 400

Invalid currency, revision or page query

### HTTP 401

Invalid session

### HTTP 404

Account absent or company billing access denied

### HTTP 409

Cursor revision does not exist for this account

## Behavior and supported scope

Organization-wide owner/admin or installation administration required, using the same authorization as company balance reads. Workspace-only sessions and company viewers cannot read shared financial policy. No account IDs, payment references or Provider prices. Exact amounts and revisions are decimal strings. Revision-descending keyset pages use one database snapshot per request; separate pages do not share a snapshot. Missing currency account returns 404; missing revision cursor returns 409. Revision zero with empty history denotes an account with no policy writes. This read does not change funds or credit. Cache-Control no-store.

**Supported scope:** implemented
