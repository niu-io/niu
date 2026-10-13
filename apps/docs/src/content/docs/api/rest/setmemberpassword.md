---
title: "Provision or reset an existing member password"
description: "PUT /admin/v1/operators/{operator}/password"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /admin/v1/operators/{operator}/password`

Requires installation administration or an owner permitted to manage the target member's scope. Admin and viewer roles cannot perform this operation. First provision omits expected_revision; resetting requires the previous returned revision. Changes revoke all previous sessions atomically and append metadata-only audit events. Hashes are never returned. Bodies are limited to 4096 bytes and all success/error responses are non-cacheable.

Operation: `setMemberPassword`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/admin/v1/operators/{operator}/password" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

### Origin

Location: **header**. Optional.

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
      "description": "Unique normalized ASCII email for this member identity."
    },
    "password": {
      "type": "string",
      "minLength": 15,
      "maxLength": 1024,
      "description": "At most 1024 UTF-8 bytes; spaces and Unicode are preserved."
    },
    "expected_revision": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": 1
    }
  }
}
```

## Responses

### HTTP 200

New credential revision; no password or hash is returned.

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
    "revision"
  ],
  "properties": {
    "revision": {
      "type": "integer",
      "minimum": 1
    }
  }
}
```

### HTTP 400

Invalid email, password bounds or JSON request.

### HTTP 401

Missing, expired or revoked administrative session.

### HTTP 403

Role or supplied Origin is not permitted.

### HTTP 404

Member is outside the caller's scope.

### HTTP 409

Credential revision changed, member was revoked, or email is already assigned.

### HTTP 429

Bounded password-worker capacity reached; Retry-After is 60 seconds.

### HTTP 501

Password sign-in has not been configured.

### HTTP 503

Durable storage or credential processing is unavailable.

## Behavior and supported scope

Requires installation administration or an owner permitted to manage the target member's scope. Admin and viewer roles cannot perform this operation. First provision omits expected_revision; resetting requires the previous returned revision. Changes revoke all previous sessions atomically and append metadata-only audit events. Hashes are never returned. Bodies are limited to 4096 bytes and all success/error responses are non-cacheable.
