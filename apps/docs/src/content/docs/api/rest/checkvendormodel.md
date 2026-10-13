---
title: "Check provider reachability and whether a mapped model is listed"
description: "POST /admin/v1/vendors/{id}/check"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/vendors/{id}/check`

Performs a bounded GET to the provider's /models endpoint. Anthropic and Gemini use native authentication headers and a 1000-model page; absence from an incomplete page remains unknown. It does not send an inference request. Redirects are blocked, response bodies are capped at 2 MiB, and provider response content and credentials are never returned. A listed model does not prove inference entitlement or quota. Requires installation administration or an explicitly granted platform administrator.

Operation: `checkVendorModel`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/vendors/{id}/check" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### id

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
  "required": [
    "alias"
  ],
  "properties": {
    "alias": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  }
}
```

## Responses

### HTTP 200

Sanitized provider check result wrapped in data.

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
        "status",
        "model",
        "http_status",
        "duration_ms",
        "checked_at_ms"
      ],
      "properties": {
        "status": {
          "type": "string",
          "enum": [
            "connected",
            "credentials_rejected",
            "endpoint_unavailable",
            "private_endpoint_blocked",
            "invalid_endpoint",
            "redirect_blocked",
            "provider_rate_limited",
            "provider_error",
            "model_catalog_unavailable",
            "model_catalog_too_large",
            "invalid_model_catalog"
          ]
        },
        "model": {
          "type": "string",
          "enum": [
            "listed",
            "not_listed",
            "unknown"
          ]
        },
        "http_status": {
          "type": [
            "integer",
            "null"
          ]
        },
        "duration_ms": {
          "type": "integer",
          "minimum": 0
        },
        "checked_at_ms": {
          "type": "integer",
          "minimum": 0
        }
      }
    }
  }
}
```

### HTTP 400

Invalid model alias.

### HTTP 401

Invalid or expired administrative credential.

### HTTP 403

Platform administration permission required.

### HTTP 404

Model alias is not mapped to this vendor.

### HTTP 503

Credential decryption or storage unavailable.

## Behavior and supported scope

Performs a bounded GET to the provider's /models endpoint. Anthropic and Gemini use native authentication headers and a 1000-model page; absence from an incomplete page remains unknown. It does not send an inference request. Redirects are blocked, response bodies are capped at 2 MiB, and provider response content and credentials are never returned. A listed model does not prove inference entitlement or quota. Requires installation administration or an explicitly granted platform administrator.

**Supported scope:** implemented
