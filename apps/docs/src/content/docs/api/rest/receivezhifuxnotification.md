---
title: "Receive signed merchant notification"
description: "POST /payments/zhifux/notify"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /payments/zhifux/notify`

Public signed post_form callback for the configured merchant, limited to 8192 body bytes. Verifies exact saved intent and commits an immutable receipt before acknowledgement. Unsigned extra fields are ignored and never authorize funding or closure. Independent authenticated query gates funding. Post-body receipt processing has a two-second deadline; errors and timeout must be retried by the sender. Browser return URLs are not accepted as evidence.

Operation: `receiveZhifuxNotification`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/payments/zhifux/notify" \
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
  "required": [
    "merchantNum",
    "orderNo",
    "amount",
    "state",
    "sign"
  ],
  "properties": {
    "merchantNum": {
      "type": "string"
    },
    "orderNo": {
      "type": "string",
      "pattern": "^[0-9a-f]{32}$"
    },
    "amount": {
      "type": "string",
      "description": "Exact requested decimal CNY amount from the saved intent."
    },
    "state": {
      "type": "string",
      "enum": [
        "1"
      ]
    },
    "sign": {
      "type": "string",
      "pattern": "^[0-9a-f]{32}$"
    }
  }
}
```

## Responses

### HTTP 200

Durable verified receipt accepted; does not mean paid or funded

Content type: `text/plain`.

```json
{
  "type": "string",
  "const": "success"
}
```

### HTTP 400

Invalid signed evidence or malformed form

### HTTP 404

Saved merchant order missing

### HTTP 413

Body exceeds 8192 bytes

### HTTP 415

Form content type required

### HTTP 422

Required form field missing

### HTTP 502

Integration unavailable or receipt processing timed out; retry notification

### HTTP 503

Durable receipt storage unavailable; retry notification

## Behavior and supported scope

Public signed post_form callback for the configured merchant, limited to 8192 body bytes. Verifies exact saved intent and commits an immutable receipt before acknowledgement. Unsigned extra fields are ignored and never authorize funding or closure. Independent authenticated query gates funding. Post-body receipt processing has a two-second deadline; errors and timeout must be retried by the sender. Browser return URLs are not accepted as evidence.
