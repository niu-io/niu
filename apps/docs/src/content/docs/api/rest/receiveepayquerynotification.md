---
title: "Receive a signed classic EPay query notification"
description: "GET /payments/epay/notify"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /payments/epay/notify`

Bounded to 8192 query bytes. Duplicate or unknown fields are rejected. Verifies the configured merchant and exact saved CNY order, method and amount before binding payment identity and funding exactly once. A browser return is never payment evidence. Post-input processing has a two-second deadline; timeout requires delivery retry. Merchant compatibility and live collection remain unqualified.

Operation: `receiveEPayQueryNotification`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/payments/epay/notify"
```

## Parameters

### pid

Location: **query**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[0-9]{1,32}$"
}
```

### out_trade_no

Location: **query**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[0-9a-f]{32}$"
}
```

### trade_no

Location: **query**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[A-Za-z0-9_-]{1,128}$"
}
```

### type

Location: **query**. **Required.**

```json
{
  "type": "string"
}
```

### money

Location: **query**. **Required.**

```json
{
  "type": "string",
  "description": "Exact decimal CNY matching the saved intent."
}
```

### trade_status

Location: **query**. **Required.**

```json
{
  "type": "string",
  "const": "TRADE_SUCCESS"
}
```

### sign

Location: **query**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[0-9a-f]{32}$"
}
```

### sign_type

Location: **query**. **Required.**

```json
{
  "type": "string",
  "const": "MD5"
}
```

### name

Location: **query**. Optional.

```json
{
  "type": "string",
  "maxLength": 1024
}
```

## Request body

No request body is declared.

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

Invalid notification, signature or saved-order evidence

### HTTP 409

Payment identity conflicts with an existing binding or another order

### HTTP 502

Integration unavailable or processing deadline exceeded; retry delivery

### HTTP 503

Durable storage unavailable; retry notification

## Behavior and supported scope

Bounded to 8192 query bytes. Duplicate or unknown fields are rejected. Verifies the configured merchant and exact saved CNY order, method and amount before binding payment identity and funding exactly once. A browser return is never payment evidence. Post-input processing has a two-second deadline; timeout requires delivery retry. Merchant compatibility and live collection remain unqualified.

**Supported scope:** implemented
