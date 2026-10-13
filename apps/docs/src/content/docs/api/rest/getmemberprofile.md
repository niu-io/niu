---
title: "Read current member profile"
description: "GET /admin/v1/auth/profile"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/auth/profile`

Current authenticated member only; the target member is derived from authentication, never supplied by the caller. Requires an operator/member session with Read permission; installation bearer credentials are rejected. Browser member-cookie sessions are also supported by the existing authentication middleware. All responses carry Cache-Control: no-store. Returns the saved name, nullable password-login email, nullable avatar and numeric profile revision.

Operation: `getMemberProfile`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/auth/profile" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
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
        "name",
        "email",
        "avatar_data_url",
        "revision"
      ],
      "properties": {
        "name": {
          "type": "string"
        },
        "email": {
          "type": [
            "string",
            "null"
          ]
        },
        "avatar_data_url": {
          "type": [
            "string",
            "null"
          ],
          "description": "Normalized PNG data URL, or null when no avatar is saved."
        },
        "revision": {
          "type": "integer",
          "format": "int64",
          "minimum": 0
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

Current authenticated member only; the target member is derived from authentication, never supplied by the caller. Requires an operator/member session with Read permission; installation bearer credentials are rejected. Browser member-cookie sessions are also supported by the existing authentication middleware. All responses carry Cache-Control: no-store. Returns the saved name, nullable password-login email, nullable avatar and numeric profile revision.

**Supported scope:** implemented
