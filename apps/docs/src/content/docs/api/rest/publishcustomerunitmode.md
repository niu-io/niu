---
title: "Publish a preview-confirmed installation billing mode"
description: "PUT /api/v1/platform/units/mode"
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/platform/units/mode`

Platform administration required and rechecked under lock. Requires an unexpired originally compatible saved preview, its matching current revision and a distinct target mode. Rechecks customer obligations atomically while holding financial-table locks. Concurrent financial activity returns a retryable 409; re-read compatibility if state changed. Balances, prices, monetary limits and historical records are never converted. A successful publication creates an immutable change receipt and advances the installation revision once. Identical idempotent retry returns the original receipt even after subsequent mode changes; it does not reapply the old mode. Mode activation alone does not establish configured unit prices, compatible spending limits, model availability or media readiness. Existing monetary limits require explicit compatible configuration before affected Credits admission. New monetary grants/funding require currency mode and new unit issuance requires Credits mode.

Operation: `publishCustomerUnitMode`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/platform/units/mode" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

No path, query, or header parameters are declared.

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "preview_id",
    "expected_revision",
    "idempotency_key"
  ],
  "properties": {
    "preview_id": {
      "type": "string",
      "format": "uuid"
    },
    "expected_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]*)$"
    },
    "idempotency_key": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

## Responses

### HTTP 200

Original durable result

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "revision",
        "previous_mode",
        "billing_mode",
        "preview_id",
        "created_at"
      ],
      "properties": {
        "revision": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "previous_mode": {
          "type": "string",
          "enum": [
            "currency",
            "credits"
          ]
        },
        "billing_mode": {
          "type": "string",
          "enum": [
            "currency",
            "credits"
          ]
        },
        "preview_id": {
          "type": "string",
          "format": "uuid"
        },
        "created_at": {
          "type": "string",
          "format": "date-time"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid input

### HTTP 401

Authentication required or revoked

### HTTP 403

Platform administration required

### HTTP 409

Stale, incompatible, expired or conflicting intent; concurrent financial activity

### HTTP 422

Malformed request

### HTTP 503

Storage unavailable

## Behavior and supported scope

Platform administration required and rechecked under lock. Requires an unexpired originally compatible saved preview, its matching current revision and a distinct target mode. Rechecks customer obligations atomically while holding financial-table locks. Concurrent financial activity returns a retryable 409; re-read compatibility if state changed. Balances, prices, monetary limits and historical records are never converted. A successful publication creates an immutable change receipt and advances the installation revision once. Identical idempotent retry returns the original receipt even after subsequent mode changes; it does not reapply the old mode. Mode activation alone does not establish configured unit prices, compatible spending limits, model availability or media readiness. Existing monetary limits require explicit compatible configuration before affected Credits admission. New monetary grants/funding require currency mode and new unit issuance requires Credits mode.

**Supported scope:** implemented
