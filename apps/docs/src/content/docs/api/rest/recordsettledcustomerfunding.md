---
title: "Record settled customer account top-up"
description: "POST /api/v1/organizations/{organization}/billing/funding/settled"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

`POST /api/v1/organizations/{organization}/billing/funding/settled`

Explicit platform administration required; ordinary company owners/admins cannot credit their own accounts. Atomically records a positive settled top-up into the company's currency account (creating a zero-balance account first if absent) keyed idempotently by (channel, payment_reference). Repeating the exact same organization, currency, amount, channel and payment reference returns success without crediting twice; reusing the same (channel, payment_reference) with different parameters returns 409.

Operation: `recordSettledCustomerFunding`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/funding/settled" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "currency",
    "amount_nanos",
    "channel",
    "payment_reference"
  ],
  "properties": {
    "currency": {
      "type": "string",
      "pattern": "^[A-Z]{3}$"
    },
    "amount_nanos": {
      "type": "string",
      "pattern": "^[1-9][0-9]{0,18}$",
      "description": "Positive exact currency nanounits, maximum 9223372036854775807."
    },
    "channel": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "payment_reference": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  }
}
```

## Responses

### HTTP 200

Settled top-up recorded, or identical previously recorded reference confirmed

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
        "recorded"
      ],
      "properties": {
        "recorded": {
          "type": "boolean"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid currency, amount, channel or payment reference

### HTTP 401

Authentication required

### HTTP 403

Explicit platform administration required

### HTTP 409

Unknown company or conflicting payment reference reuse

## Behavior and supported scope

Explicit platform administration required; ordinary company owners/admins cannot credit their own accounts. Atomically records a positive settled top-up into the company's currency account (creating a zero-balance account first if absent) keyed idempotently by (channel, payment_reference). Repeating the exact same organization, currency, amount, channel and payment reference returns success without crediting twice; reusing the same (channel, payment_reference) with different parameters returns 409.

**Supported scope:** implemented
