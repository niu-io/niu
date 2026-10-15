---
title: "Update current member profile"
description: "PUT /api/v1/auth/profile"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/auth/profile`

Current authenticated member only; the target member is derived from authentication, never supplied by the caller. Requires an operator/member session with Read permission; installation bearer credentials are rejected. Browser member-cookie sessions are also supported by the existing authentication middleware. All responses carry Cache-Control: no-store. When password authentication is configured, cookie/browser writes require a valid Origin and cookie-request checks; bearer writes validate Origin when supplied. Atomically updates name and avatar with optimistic revision checking. Email is read-only. Null or omitted avatar_data_url clears the avatar. Route body limit is 180000 bytes; rejected bodies are mapped to JSON invalid-request errors.

Operation: `updateMemberProfile`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/auth/profile" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN" \
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
    "name",
    "expected_revision"
  ],
  "properties": {
    "name": {
      "type": "string",
      "maxLength": 100,
      "description": "Trimmed before saving; must contain 1 to 100 Unicode characters and no control characters."
    },
    "avatar_data_url": {
      "type": [
        "string",
        "null"
      ],
      "maxLength": 175000,
      "description": "Optional PNG data URL. Null or omission removes the existing avatar. Decoded and normalized PNG must each be at most 131072 bytes and dimensions at most 256 by 256 pixels."
    },
    "expected_revision": {
      "type": "integer",
      "format": "int64",
      "minimum": 0,
      "description": "Numeric revision returned by GET; a profile with no saved customization starts at zero. Successful update increments it."
    }
  }
}
```

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

### HTTP 400

Invalid JSON, unknown fields or invalid input.

### HTTP 401

Missing, invalid or revoked member authentication.

### HTTP 403

Read permission required; installation credentials cannot access member data, or a write failed origin/cookie checks.

### HTTP 409

expected_revision does not match the saved profile; reload before retrying.

### HTTP 503

Durable storage unavailable.

## Behavior and supported scope

Current authenticated member only; the target member is derived from authentication, never supplied by the caller. Requires an operator/member session with Read permission; installation bearer credentials are rejected. Browser member-cookie sessions are also supported by the existing authentication middleware. All responses carry Cache-Control: no-store. When password authentication is configured, cookie/browser writes require a valid Origin and cookie-request checks; bearer writes validate Origin when supplied. Atomically updates name and avatar with optimistic revision checking. Email is read-only. Null or omitted avatar_data_url clears the avatar. Route body limit is 180000 bytes; rejected bodies are mapped to JSON invalid-request errors.

**Supported scope:** implemented
