---
title: "Change the signed-in member's password with current-password proof"
description: "PUT /admin/v1/auth/password"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /admin/v1/auth/password`

All member roles may change their own password; installation credentials cannot. No target member or email is accepted. Verification uses shared sign-in throttling and bounded workers. Credential revision checks prevent concurrent resets from being overwritten. Success revokes all of this member's sessions atomically with audit records and requires fresh sign-in. Browser-cookie requests require the configured Origin and clear the cookie on success. Failed changes preserve sessions and do not clear the cookie. JSON bodies are limited to 4096 bytes. All responses are non-cacheable.

Operation: `changeOwnMemberPassword`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  },
  {
    "memberCookie": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X PUT "$NIU_ORIGIN/admin/v1/auth/password" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
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
    "current_password",
    "password"
  ],
  "properties": {
    "current_password": {
      "type": "string",
      "maxLength": 1024,
      "writeOnly": true
    },
    "password": {
      "type": "string",
      "minLength": 15,
      "maxLength": 1024,
      "writeOnly": true
    }
  }
}
```

## Responses

### HTTP 200

Password changed and sessions revoked

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "revision",
    "sign_in_required"
  ],
  "properties": {
    "revision": {
      "type": "integer",
      "minimum": 1
    },
    "sign_in_required": {
      "const": true
    }
  }
}
```

### HTTP 400

Invalid input or password policy failure; UTF-8 byte limit is 1024

### HTTP 401

Invalid session or incorrect current password

### HTTP 403

Installation identity or invalid browser origin

### HTTP 409

Credential revision changed during verification; no reset applied

### HTTP 429

Password verification limited; Retry-After 60

### HTTP 501

Password authentication not configured

### HTTP 503

Password change unavailable; do not assume completion

## Behavior and supported scope

All member roles may change their own password; installation credentials cannot. No target member or email is accepted. Verification uses shared sign-in throttling and bounded workers. Credential revision checks prevent concurrent resets from being overwritten. Success revokes all of this member's sessions atomically with audit records and requires fresh sign-in. Browser-cookie requests require the configured Origin and clear the cookie on success. Failed changes preserve sessions and do not clear the cookie. JSON bodies are limited to 4096 bytes. All responses are non-cacheable.
