---
title: "Save current member appearance preference"
description: "PUT /admin/v1/auth/preferences"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /admin/v1/auth/preferences`

Current authenticated member only; the target member is derived from authentication, never supplied by the caller. Requires an operator/member session with Read permission; installation bearer credentials are rejected. Browser member-cookie sessions are also supported by the existing authentication middleware. All responses carry Cache-Control: no-store. When password authentication is configured, cookie/browser writes require a valid Origin and cookie-request checks; bearer writes validate Origin when supplied. Saves one of system, light or dark. This endpoint has no revision precondition; subsequent accepted writes replace the saved mode. Route body limit is 1024 bytes; rejected bodies are mapped to JSON invalid-request errors.

Operation: `updateMemberPreferences`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/admin/v1/auth/preferences" \
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

### HTTP 400

Invalid JSON, unknown fields or invalid input.

### HTTP 401

Missing, invalid or revoked member authentication.

### HTTP 403

Read permission required; installation credentials cannot access member data, or a write failed origin/cookie checks.

### HTTP 503

Durable storage unavailable.

## Behavior and supported scope

Current authenticated member only; the target member is derived from authentication, never supplied by the caller. Requires an operator/member session with Read permission; installation bearer credentials are rejected. Browser member-cookie sessions are also supported by the existing authentication middleware. All responses carry Cache-Control: no-store. When password authentication is configured, cookie/browser writes require a valid Origin and cookie-request checks; bearer writes validate Origin when supplied. Saves one of system, light or dark. This endpoint has no revision precondition; subsequent accepted writes replace the saved mode. Route body limit is 1024 bytes; rejected bodies are mapped to JSON invalid-request errors.

**Supported scope:** implemented
