---
title: "Read credential safe-failure cooldown"
description: "GET /api/v1/vendors/{vendor}/cooldown"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/vendors/{vendor}/cooldown`

Platform administration only. Fixed policy: three new canonical OpenRouter text authentication rejections with pinned nonexecution qualification within 60 seconds pause new selection for 60 seconds. Further qualifying in-flight failures may extend the deadline; unknown execution never counts. State is shared in PostgreSQL, independent per credential, and survives restart and credential edits. Expiry automatically restores eligibility without a health probe or republish. Does not cancel pinned requests or saved video recovery. No historical failures are backfilled. This read performs no upstream request.

Operation: `getVendorCooldown`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/vendors/{vendor}/cooldown" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### vendor

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Current state and fixed policy. Expired deadlines may remain in history while active is false.

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
      "additionalProperties": false,
      "required": [
        "policy_revision",
        "failure_threshold",
        "window_seconds",
        "cooldown_seconds",
        "active",
        "cooldown_until",
        "qualifying_failures"
      ],
      "properties": {
        "policy_revision": {
          "type": "string",
          "const": "openrouter-auth-cooldown-v1"
        },
        "failure_threshold": {
          "type": "integer",
          "const": 3
        },
        "window_seconds": {
          "type": "integer",
          "const": 60
        },
        "cooldown_seconds": {
          "type": "integer",
          "const": 60
        },
        "active": {
          "type": "boolean"
        },
        "cooldown_until": {
          "type": [
            "string",
            "null"
          ],
          "format": "date-time"
        },
        "qualifying_failures": {
          "type": "integer",
          "minimum": 0,
          "description": "New qualifying failures recorded in the current rolling window, not total upstream failures."
        }
      }
    }
  }
}
```

### HTTP 401

Invalid administrative credential.

### HTTP 403

Platform permission required.

### HTTP 404

Credential not found.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Platform administration only. Fixed policy: three new canonical OpenRouter text authentication rejections with pinned nonexecution qualification within 60 seconds pause new selection for 60 seconds. Further qualifying in-flight failures may extend the deadline; unknown execution never counts. State is shared in PostgreSQL, independent per credential, and survives restart and credential edits. Expiry automatically restores eligibility without a health probe or republish. Does not cancel pinned requests or saved video recovery. No historical failures are backfilled. This read performs no upstream request.

**Supported scope:** implemented
