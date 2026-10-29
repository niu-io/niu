---
title: "Receive a signed classic EPay form notification"
description: "POST /payments/epay/notify"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /payments/epay/notify`

Same verified funding contract as GET. Form bodies are limited to 8192 bytes. Rejects duplicate and unknown fields before verification. Post-body processing has a two-second deadline. Acknowledgment follows durable funding; replay never creates a second credit.

Operation: `receiveEPayFormNotification`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/payments/epay/notify" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-binary @request-body
```

## Parameters

No path, query, or header parameters are declared.

## Request body

### application/x-www-form-urlencoded

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "pid",
    "out_trade_no",
    "trade_no",
    "type",
    "money",
    "trade_status",
    "sign",
    "sign_type"
  ],
  "properties": {
    "pid": {
      "type": "string",
      "pattern": "^[0-9]{1,32}$"
    },
    "out_trade_no": {
      "type": "string",
      "pattern": "^[0-9a-f]{32}$"
    },
    "trade_no": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_-]{1,128}$"
    },
    "type": {
      "type": "string"
    },
    "money": {
      "type": "string",
      "description": "Exact decimal CNY matching the saved intent."
    },
    "trade_status": {
      "type": "string",
      "const": "TRADE_SUCCESS"
    },
    "sign": {
      "type": "string",
      "pattern": "^[0-9a-f]{32}$"
    },
    "sign_type": {
      "type": "string",
      "const": "MD5"
    },
    "name": {
      "type": "string",
      "maxLength": 1024
    }
  }
}
```

## Responses

### HTTP 200

Verified payment committed or replayed; exactly one saved-order credit

Response headers:

```json
{
  "Cache-Control": {
    "schema": {
      "type": "string",
      "const": "no-store"
    }
  }
}
```

Content type: `text/plain`.

```json
{
  "type": "string",
  "const": "success"
}
```

### HTTP 400

Invalid form content type, notification or signed saved-order evidence

### HTTP 409

Payment identity conflicts with an existing binding or another order

### HTTP 413

Form exceeds 8192 bytes

### HTTP 502

Integration unavailable or processing deadline exceeded; retry delivery

### HTTP 503

Durable storage unavailable; retry notification

## Behavior and supported scope

Same verified funding contract as GET. Form bodies are limited to 8192 bytes. Rejects duplicate and unknown fields before verification. Post-body processing has a two-second deadline. Acknowledgment follows durable funding; replay never creates a second credit.

**Supported scope:** implemented
