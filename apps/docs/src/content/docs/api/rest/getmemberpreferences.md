---
title: "Read current member appearance preference"
description: "GET /api/v1/auth/preferences"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/auth/preferences`

Current authenticated member only; the target member is derived from authentication, never supplied by the caller. Requires an operator/member session with Read permission; installation bearer credentials are rejected. Browser member-cookie sessions are also supported by the existing authentication middleware. All responses carry Cache-Control: no-store. Returns the saved color mode; when no member preference exists, returns the installation branding default appearance. No revision field is exposed.

Operation: `getMemberPreferences`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/auth/preferences" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Current saved member data.

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
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "required": [
        "color_mode"
      ],
      "properties": {
        "color_mode": {
          "type": "string",
          "enum": [
            "system",
            "light",
            "dark"
          ]
        }
      }
    }
  }
}
```

### HTTP 401

Missing, invalid or revoked member authentication.

### HTTP 403

Read permission required; installation credentials cannot access member data, or a write failed origin/cookie checks.

### HTTP 503

Durable storage unavailable.

## Behavior and supported scope

Current authenticated member only; the target member is derived from authentication, never supplied by the caller. Requires an operator/member session with Read permission; installation bearer credentials are rejected. Browser member-cookie sessions are also supported by the existing authentication middleware. All responses carry Cache-Control: no-store. Returns the saved color mode; when no member preference exists, returns the installation branding default appearance. No revision field is exposed.

**Supported scope:** implemented
