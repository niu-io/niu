---
title: "Update Limited Preview registration policy"
description: "PUT /api/v1/platform/registration"
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/platform/registration`

Platform administration required. Switches public registration between approval_required (Limited Preview) and disabled using optimistic expected_revision.

Operation: `savePlatformRegistrationPolicy`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/platform/registration" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
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
    "mode",
    "expected_revision"
  ],
  "properties": {
    "mode": {
      "type": "string",
      "enum": [
        "disabled",
        "approval_required"
      ]
    },
    "expected_revision": {
      "type": "string",
      "pattern": "^[1-9][0-9]*$"
    }
  }
}
```

## Responses

### HTTP 200

Updated registration policy.

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

### HTTP 400

Invalid policy mode or revision.

### HTTP 401

Authentication required.

### HTTP 403

Platform administration required.

### HTTP 409

Policy changed concurrently; refresh revision and retry.

## Behavior and supported scope

Platform administration required. Switches public registration between approval_required (Limited Preview) and disabled using optimistic expected_revision.

**Supported scope:** implemented
