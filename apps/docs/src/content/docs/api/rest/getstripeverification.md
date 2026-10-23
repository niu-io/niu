---
title: "Read Stripe verification evidence"
description: "GET /api/v1/platform/payments/stripe/verification"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/platform/payments/stripe/verification`

Installation administrator only. Reads evidence bound to current effective Stripe configuration and currency. Account and callback verification are separate; no merchant identity or credentials are returned. Does not contact Stripe.

Operation: `getStripeVerification`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/platform/payments/stripe/verification" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Current configuration-bound verification

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "account_verified": {
          "type": "boolean"
        },
        "callback_verified": {
          "type": "boolean"
        }
      }
    }
  }
}
```

### HTTP 400

Real Stripe checkout is not configured

### HTTP 403

Installation administrator required

## Behavior and supported scope

Installation administrator only. Reads evidence bound to current effective Stripe configuration and currency. Account and callback verification are separate; no merchant identity or credentials are returned. Does not contact Stripe.

**Supported scope:** implemented
