---
title: "Read one original noncash gift and its correction"
description: "GET /api/v1/organizations/{organization}/billing/accounts/{currency}/grants/{grant}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/billing/accounts/{currency}/grants/{grant}`

Platform-only current snapshot of one original gift and its immutable correction. Use to recover a lost correction response. An absent correction in this read does not prove an in-flight request failed; retry only the exact original correction input and key. No mutation.

Operation: `getIssuedCustomerBalanceGrant`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/accounts/{currency}/grants/{grant}" \
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

### currency

Location: **path**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
}
```

### grant

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

Issued gifts and their correction, if any

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
  }
}
```

### HTTP 400

Invalid currency or page size

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 404

No issued gift in this company and currency

### HTTP 409

Cursor is unavailable or out of scope

## Behavior and supported scope

Platform-only current snapshot of one original gift and its immutable correction. Use to recover a lost correction response. An absent correction in this read does not prove an in-flight request failed; retry only the exact original correction input and key. No mutation.

**Supported scope:** implemented
