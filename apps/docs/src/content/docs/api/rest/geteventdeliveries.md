---
title: "Inspect the latest 100 subscription deliveries"
description: "GET /v1/events/{slug}/deliveries"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/events/{slug}/deliveries`

Requires a current workspace API key with explicitly delegated events:read. Responses are no-store. Persisted latest attempt state, bounded retry count, HTTP outcome, lease expiry and next scheduled retry. A sending row with expired lease is not evidence of a currently active network call. Lost acknowledgements stay unknown. Only 2xx is delivery acknowledgement; no host wake, receiver processing or task success is established. Response bodies and arbitrary upstream errors are not retained. Reconcile via sequence in the event log.

Operation: `getEventDeliveries`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  },
  {
    "niuApiKeyAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

Authentication alternative: `bearerAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/events/{slug}/deliveries" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/events/{slug}/deliveries" \
  -H "X-Niu-API-Key: $NIU_API_KEY"
```

## Parameters

### slug

Location: **path**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
  "maxLength": 80
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Scoped result

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "subscription_revision": {
            "type": "integer"
          },
          "sequence": {
            "type": "string"
          },
          "state": {
            "type": "string",
            "enum": [
              "pending",
              "sending",
              "delivered",
              "failed",
              "cancelled"
            ]
          },
          "attempts": {
            "type": "integer",
            "minimum": 0,
            "maximum": 8
          },
          "response_status": {
            "type": [
              "integer",
              "null"
            ],
            "description": "Latest attempt HTTP outcome; null is unknown. A 2xx acknowledges receipt, not processing or task success."
          },
          "failure_kind": {
            "type": [
              "string",
              "null"
            ],
            "enum": [
              "transport",
              "destination",
              "signature",
              "http",
              "authority",
              "superseded",
              "exhausted",
              null
            ]
          },
          "updated_at": {
            "type": "string",
            "format": "date-time"
          },
          "lease_expires_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "lease_expired": {
            "type": "boolean"
          },
          "next_attempt_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          }
        }
      }
    },
    "limit": {
      "type": "integer",
      "const": 100
    }
  }
}
```

### HTTP 400

Invalid configuration or cursor

### HTTP 401

Invalid, expired or revoked key

### HTTP 403

Required current delegation is absent

### HTTP 404

Scoped subscription not found

### HTTP 409

Revision, quota or cursor conflict

### HTTP 503

Required encryption or storage unavailable

## Behavior and supported scope

Requires a current workspace API key with explicitly delegated events:read. Responses are no-store. Persisted latest attempt state, bounded retry count, HTTP outcome, lease expiry and next scheduled retry. A sending row with expired lease is not evidence of a currently active network call. Lost acknowledgements stay unknown. Only 2xx is delivery acknowledgement; no host wake, receiver processing or task success is established. Response bodies and arbitrary upstream errors are not retained. Reconcile via sequence in the event log.

**Supported scope:** implemented
