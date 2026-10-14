---
title: "Record an already completed external Provider payment"
description: "POST /admin/v1/providers/{provider}/settlements"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/providers/{provider}/settlements`

Platform administration required; Provider membership does not grant this write. Does not transfer funds. Selected earnings must belong to this Provider, share one currency, remain unpaid and have a positive exact total. The server computes the amount. Reuse the supplied idempotency key with the identical reference and entry set for retries; entry order is irrelevant. Changed replay, duplicate payment reference or unavailable selections return 409. No customer balance credit or Provider qualification is created.

Operation: `recordExternalProviderPayment`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/providers/{provider}/settlements" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### provider

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### provider

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
    "idempotency_key",
    "payment_reference",
    "attempt_ids"
  ],
  "properties": {
    "idempotency_key": {
      "type": "string",
      "format": "uuid"
    },
    "payment_reference": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200,
      "description": "Nonblank reference, at most 200 UTF-8 bytes, no control characters. Preserve the exact value on retry."
    },
    "attempt_ids": {
      "type": "array",
      "minItems": 1,
      "maxItems": 1000,
      "uniqueItems": true,
      "items": {
        "type": "string",
        "format": "uuid"
      },
      "description": "Internal selection IDs from the platform earning history; never display IDs or require users to paste them."
    }
  }
}
```

## Responses

### HTTP 200

Recorded or replayed settlement identity.

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

Invalid reference, entry set, or currency mix.

### HTTP 401

Invalid administrative credential.

### HTTP 403

Platform administration required.

### HTTP 409

Provider or earnings unavailable, changed replay, or duplicate payment reference.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Platform administration required; Provider membership does not grant this write. Does not transfer funds. Selected earnings must belong to this Provider, share one currency, remain unpaid and have a positive exact total. The server computes the amount. Reuse the supplied idempotency key with the identical reference and entry set for retries; entry order is irrelevant. Changed replay, duplicate payment reference or unavailable selections return 409. No customer balance credit or Provider qualification is created.

**Supported scope:** implemented
