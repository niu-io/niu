---
title: "Discover member sign-in availability"
description: "GET /api/v1/auth/config"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/auth/config`

Public capability discovery only. password_login and browser_token_login advertise the configured password and existing user-token browser sign-in transports. A missing browser_token_login field on an older Gateway does not establish support. This response does not disclose identities, credentials or upstream merchant status, and is not proof of deployed HTTPS/browser acceptance. Response carries Cache-Control: no-store.

Operation: `getMemberAuthenticationConfiguration`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/auth/config"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Local password sign-in capability.

Response headers:

```json
{
  "Cache-Control": {
    "schema": {
      "type": "string",
      "const": "no-store"
    }
  }
}
```

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "password_login",
    "browser_token_login"
  ],
  "properties": {
    "password_login": {
      "type": "boolean"
    },
    "browser_token_login": {
      "type": "boolean"
    },
    "demo_login": {
      "type": "boolean"
    }
  }
}
```

## Behavior and supported scope

Public capability discovery only. password_login and browser_token_login advertise the configured password and existing user-token browser sign-in transports. A missing browser_token_login field on an older Gateway does not establish support. This response does not disclose identities, credentials or upstream merchant status, and is not proof of deployed HTTPS/browser acceptance. Response carries Cache-Control: no-store.

**Supported scope:** implemented
