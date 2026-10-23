---
title: "Read platform payment configuration presence"
description: "GET /api/v1/platform/configuration"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/platform/configuration`

Requires platform management permission. Returns configuration-presence flags without merchant credentials. EPay is configured when a saved configuration exists (including disabled configurations) or deployment configuration is present; Zhifux and Stripe reflect loaded runtime adapters. Use customer payment-method discovery for checkout availability and the integration inventory for supported capabilities. This response does not prove successful external payments.

Operation: `getPlatformConfiguration`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/platform/configuration" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Sanitized configuration presence and current configuration-bound verification; no merchant identities or credentials.

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
        "payment_gateways",
        "verification"
      ],
      "properties": {
        "payment_gateways": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "name",
              "configured"
            ],
            "properties": {
              "name": {
                "type": "string",
                "enum": [
                  "Zhifux",
                  "EPay",
                  "Stripe"
                ]
              },
              "configured": {
                "type": "boolean",
                "description": "Configuration presence only; not enabled checkout, merchant eligibility, or payment qualification."
              }
            }
          }
        },
        "verification": {
          "type": "object",
          "required": [
            "currency_configured",
            "gateways"
          ],
          "properties": {
            "currency_configured": {
              "type": "boolean"
            },
            "gateways": {
              "type": "array",
              "items": {
                "type": "object",
                "required": [
                  "checkout_enabled",
                  "currency_supported",
                  "callback_verified",
                  "ready",
                  "gateway",
                  "account_verified"
                ],
                "properties": {
                  "checkout_enabled": {
                    "type": "boolean"
                  },
                  "currency_supported": {
                    "type": "boolean"
                  },
                  "callback_verified": {
                    "type": "boolean"
                  },
                  "ready": {
                    "type": "boolean"
                  },
                  "gateway": {
                    "type": "string",
                    "enum": [
                      "epay",
                      "stripe",
                      "zhifux"
                    ]
                  },
                  "account_verified": {
                    "type": [
                      "boolean",
                      "null"
                    ],
                    "description": "Current account eligibility for adapters with an account check; null when unsupported or simulated."
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

### HTTP 401

Authentication required

### HTTP 403

Platform management permission required

### HTTP 503

Configuration storage unavailable

## Behavior and supported scope

Requires platform management permission. Returns configuration-presence flags without merchant credentials. EPay is configured when a saved configuration exists (including disabled configurations) or deployment configuration is present; Zhifux and Stripe reflect loaded runtime adapters. Use customer payment-method discovery for checkout availability and the integration inventory for supported capabilities. This response does not prove successful external payments.

**Supported scope:** implemented
