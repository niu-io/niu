---
title: "Read a member's sign-in configuration"
description: "GET /api/v1/operators/{operator}/password"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/operators/{operator}/password`

Requires installation administration or an owner permitted to manage the target member's scope. Returns only the saved email and credential revision, never the password or hash. Available even when password sign-in is disabled; use auth/config to check sign-in availability separately. After an uncertain reset, refresh this revision before another explicit reset. A changed revision is not proof that a particular password was saved. Revoked or missing members return 404. All responses are non-cacheable.

Operation: `getMemberPasswordConfiguration`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/operators/{operator}/password" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### operator

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

Saved sign-in configuration; null email and revision when unconfigured.

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
    "configured",
    "email",
    "revision"
  ],
  "properties": {
    "configured": {
      "type": "boolean"
    },
    "email": {
      "type": [
        "string",
        "null"
      ]
    },
    "revision": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": 1
    }
  }
}
```

### HTTP 401

Authentication required.

### HTTP 403

Member management permission required.

### HTTP 404

Member is missing

### HTTP 503

Saved configuration could not be read.

## Behavior and supported scope

Requires installation administration or an owner permitted to manage the target member's scope. Returns only the saved email and credential revision, never the password or hash. Available even when password sign-in is disabled; use auth/config to check sign-in availability separately. After an uncertain reset, refresh this revision before another explicit reset. A changed revision is not proof that a particular password was saved. Revoked or missing members return 404. All responses are non-cacheable.
