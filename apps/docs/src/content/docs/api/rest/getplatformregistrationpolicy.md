---
title: "Read Limited Preview registration policy"
description: "GET /api/v1/platform/registration"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/platform/registration`

Platform administration required. Returns the saved registration policy revision and whether password sign-in is active.

Operation: `getPlatformRegistrationPolicy`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/platform/registration" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Current registration policy.

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
  "additionalProperties": false,
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "mode",
        "revision",
        "updated_at",
        "password_login_configured"
      ],
      "properties": {
        "mode": {
          "type": "string",
          "enum": [
            "disabled",
            "approval_required"
          ],
          "description": "disabled (invite/admin setup only) or approval_required (Limited Preview)."
        },
        "revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        },
        "updated_at": {
          "type": "string"
        },
        "password_login_configured": {
          "type": "boolean"
        }
      }
    }
  }
}
```

### HTTP 401

Authentication required.

### HTTP 403

Platform administration required.

## Behavior and supported scope

Platform administration required. Returns the saved registration policy revision and whether password sign-in is active.

**Supported scope:** implemented
