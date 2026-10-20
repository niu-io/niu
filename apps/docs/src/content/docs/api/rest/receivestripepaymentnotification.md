---
title: "Receive a signed Stripe checkout notification"
description: "POST /payments/stripe/notify"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /payments/stripe/notify`

Server-to-server callback; no installation or workspace bearer token is required. Verifies the signature over the original request bytes before parsing JSON, then requires an existing merchant-bound order and its saved checkout session. Paid evidence must match the saved session, amount, currency and configured live mode. Settlement is idempotent. Creating a checkout or visiting its return URL does not credit a balance. Unsupported or unrelated events are rejected rather than silently acknowledged. Maximum request body: 262144 bytes.

Operation: `receiveStripePaymentNotification`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/payments/stripe/notify" \
  -H 'stripe-signature: <STRIPE_SIGNATURE>' \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### stripe-signature

Location: **header**. **Required.** Stripe timestamp and v1 signature of the unmodified request body.

```json
{
  "type": "string"
}
```

## Request body

### application/json

**Required.**

Original signed Stripe event JSON; proxies must preserve its bytes.

```json
{
  "type": "object",
  "additionalProperties": true
}
```

## Responses

### HTTP 200

Verified settlement accepted, including an already settled replay; empty response body.

### HTTP 400

Missing or invalid signature, malformed notification, unknown or unbound order, or mismatched paid evidence.

### HTTP 409

Stored order conflicts with settlement.

### HTTP 413

Request body exceeds 262144 bytes.

### HTTP 502

Stripe is not configured or the payment clock is unavailable.

### HTTP 503

Durable storage is unavailable.

## Behavior and supported scope

Server-to-server callback; no installation or workspace bearer token is required. Verifies the signature over the original request bytes before parsing JSON, then requires an existing merchant-bound order and its saved checkout session. Paid evidence must match the saved session, amount, currency and configured live mode. Settlement is idempotent. Creating a checkout or visiting its return URL does not credit a balance. Unsupported or unrelated events are rejected rather than silently acknowledged. Maximum request body: 262144 bytes.

**Supported scope:** implemented
