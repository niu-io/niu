---
title: "Sign in with a secure HttpOnly member cookie"
description: "POST /api/v1/auth/browser/login"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/auth/browser/login`

Requires the configured HTTPS Origin header. Uses the same password limits and durable throttling as bearer login. Sets __Host-niu_member_session with Secure, HttpOnly, SameSite=Lax, Path=/ and Max-Age=28800; no Domain. The response contains session metadata only, never the bearer token. When supplied, Sec-Fetch-Site must be a single same-origin value. All responses use Cache-Control no-store.

Operation: `createBrowserMemberSession`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path and required-header placeholders with the values required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/auth/browser/login" \
  -H 'Origin: <ORIGIN>' \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### Origin

Location: **header**. **Required.**

```json
{
  "type": "string"
}
```

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "email",
    "password"
  ],
  "properties": {
    "email": {
      "type": "string",
      "maxLength": 254,
      "description": "ASCII email; surrounding spaces and case are normalized."
    },
    "password": {
      "type": "string",
      "maxLength": 1024,
      "description": "At most 1024 UTF-8 bytes; no trimming or normalization."
    }
  }
}
```

## Responses

### HTTP 200

Scoped browser session created

Response headers:

```json
{
  "Set-Cookie": {
    "schema": {
      "type": "string"
    },
    "description": "Secure HttpOnly host-only member session"
  }
}
```

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "session"
  ],
  "properties": {
    "session": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "operator_id",
        "expires_at_unix",
        "revoked"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "operator_id": {
          "type": "string",
          "format": "uuid"
        },
        "expires_at_unix": {
          "type": "integer"
        },
        "revoked": {
          "type": "boolean"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid or oversized credentials

### HTTP 401

Incorrect email or password

### HTTP 403

Missing or mismatched Origin

### HTTP 429

Sign-in limited; Retry-After 60

### HTTP 501

Password login not configured

### HTTP 503

Session creation unavailable

## Behavior and supported scope

Requires the configured HTTPS Origin header. Uses the same password limits and durable throttling as bearer login. Sets __Host-niu_member_session with Secure, HttpOnly, SameSite=Lax, Path=/ and Max-Age=28800; no Domain. The response contains session metadata only, never the bearer token. When supplied, Sec-Fetch-Site must be a single same-origin value. All responses use Cache-Control no-store.
