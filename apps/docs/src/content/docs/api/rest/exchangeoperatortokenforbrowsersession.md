---
title: "Use an existing user access token in the browser"
description: "POST /admin/v1/auth/browser/token"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/auth/browser/token`

Requires an explicit trusted same-origin Origin and a valid durable Operator session token. Installation credentials, inference keys, revoked sessions and expired sessions are refused. Sets the existing HttpOnly SameSite cookie to the original token without creating an identity or session, extending expiry, changing role/scope, or returning the token in JSON. Cookie lifetime is capped at the original remaining lifetime and eight hours; every subsequent request rechecks the original durable session. Requires configured browser authentication origin. Responses are not cached.

Operation: `exchangeOperatorTokenForBrowserSession`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path and required-header placeholders with the values required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/auth/browser/token" \
  -H 'Origin: <ORIGIN>' \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### Origin

Location: **header**. **Required.** Exact configured browser origin, matching the trusted same-origin UI. A missing, mismatched or cross-site origin is refused.

```json
{
  "type": "string",
  "format": "uri"
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
    "token"
  ],
  "properties": {
    "token": {
      "type": "string",
      "minLength": 74,
      "maxLength": 74,
      "pattern": "^niu_admin_[0-9a-f]{64}$",
      "writeOnly": true,
      "description": "Original user access token; never place it in a URL or browser storage."
    }
  }
}
```

## Responses

### HTTP 204

Original session established as an HttpOnly browser cookie; no response body.

Response headers:

```json
{
  "Cache-Control": {
    "schema": {
      "type": "string",
      "const": "no-store"
    }
  },
  "Set-Cookie": {
    "description": "Existing original Operator session transported in the protected HttpOnly SameSite browser cookie, with lifetime bounded by its original expiry. No cookie value example is provided."
  }
}
```

### HTTP 400

Malformed JSON or unknown request fields.

### HTTP 401

Invalid, expired, revoked or non-Operator credential.

### HTTP 403

Missing, untrusted or cross-site Origin.

### HTTP 501

Browser authentication origin is not configured.

### HTTP 503

Durable authentication storage is unavailable.

## Behavior and supported scope

Requires an explicit trusted same-origin Origin and a valid durable Operator session token. Installation credentials, inference keys, revoked sessions and expired sessions are refused. Sets the existing HttpOnly SameSite cookie to the original token without creating an identity or session, extending expiry, changing role/scope, or returning the token in JSON. Cookie lifetime is capped at the original remaining lifetime and eight hours; every subsequent request rechecks the original durable session. Requires configured browser authentication origin. Responses are not cached.

**Supported scope:** implemented
