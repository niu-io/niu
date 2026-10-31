---
title: "Review: Inspect the latest 100 subscription deliveries"
description: "GET /api/v1/workspaces/{workspace}/events/{slug}/deliveries"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/workspaces/{workspace}/events/{slug}/deliveries`

Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.

Operation: `getWorkspaceReviewDeliveries`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/workspaces/{workspace}/events/{slug}/deliveries" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### workspace

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

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

Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.

**Supported scope:** implemented
