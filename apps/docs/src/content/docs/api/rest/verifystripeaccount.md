---
title: "Check the configured Stripe account"
description: "POST /api/v1/platform/payments/stripe/verification"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/platform/payments/stripe/verification`

Installation administrator write permission required. Performs a bounded read-only Stripe account check and persists evidence for the current configuration for ten minutes. Does not create checkout, charge money, or assert callback verification. Transient check failure preserves prior evidence only until its original expiry; credential rejection or disabled charges revokes it immediately. Mock mode is excluded. Merchant errors are sanitized.

Operation: `verifyStripeAccount`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/platform/payments/stripe/verification" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Account check result

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "result": {
          "type": "string",
          "enum": [
            "account_enabled",
            "account_disabled",
            "credentials_rejected",
            "check_unavailable"
          ]
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

Installation administrator write permission required. Performs a bounded read-only Stripe account check and persists evidence for the current configuration for ten minutes. Does not create checkout, charge money, or assert callback verification. Transient check failure preserves prior evidence only until its original expiry; credential rejection or disabled charges revokes it immediately. Mock mode is excluded. Merchant errors are sanitized.

**Supported scope:** implemented
