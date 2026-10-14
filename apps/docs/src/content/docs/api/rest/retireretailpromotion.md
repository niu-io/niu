---
title: "Append a promotion eligibility cutoff"
description: "POST /admin/v1/pricing/standard-prices/{price}/promotions/{promotion}/retire"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/pricing/standard-prices/{price}/promotions/{promotion}/retire`

Explicit platform administration required; ordinary customer/Provider membership does not grant access. Append-only explicit retirement, at most one cutoff for this promotion. Cutoff cannot extend its published end; a cutoff before its start cancels a future rule. Exact epoch-second strings and configuration version are required. Published schedules and already pinned operations/jobs stay immutable. This does not trigger a customer refund or change routing.

Operation: `retireRetailPromotion`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/pricing/standard-prices/{price}/promotions/{promotion}/retire" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### price

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### promotion

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
  "properties": {
    "effective_until": {
      "type": "string",
      "pattern": "^[0-9]+$"
    },
    "expected_version": {
      "type": "string",
      "pattern": "^[0-9]+$"
    },
    "idempotency_key": {
      "type": "string",
      "format": "uuid"
    },
    "reason": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500
    }
  },
  "required": [
    "effective_until",
    "expected_version",
    "idempotency_key",
    "reason"
  ]
}
```

## Responses

### HTTP 200

Current configuration or exact prior committed publication

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "data": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "price_id": {
          "type": "string",
          "format": "uuid"
        },
        "revision": {
          "type": "string",
          "format": "uuid"
        },
        "version": {
          "type": "string",
          "pattern": "^[0-9]+$"
        }
      },
      "required": [
        "price_id",
        "revision",
        "version"
      ]
    }
  },
  "required": [
    "data"
  ]
}
```

### HTTP 400

Invalid exact amount, schedule, period or pagination

### HTTP 401

Authentication required

### HTTP 403

Explicit platform administration required

### HTTP 409

Stale version, conflicting key/period, unknown identity/customer or unsupported publication

### HTTP 422

Malformed JSON or unsupported schedule shape

## Behavior and supported scope

Explicit platform administration required; ordinary customer/Provider membership does not grant access. Append-only explicit retirement, at most one cutoff for this promotion. Cutoff cannot extend its published end; a cutoff before its start cancels a future rule. Exact epoch-second strings and configuration version are required. Published schedules and already pinned operations/jobs stay immutable. This does not trigger a customer refund or change routing.

**Supported scope:** implemented
