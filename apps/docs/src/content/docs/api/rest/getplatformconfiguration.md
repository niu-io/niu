---
title: "Read platform payment configuration presence"
description: "GET /admin/v1/platform/configuration"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/platform/configuration`

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/platform/configuration" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Sanitized configuration presence

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
        "payment_gateways"
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
