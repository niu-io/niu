---
title: "Create the first platform administrator account during initial setup"
description: "POST /api/v1/setup"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

`POST /api/v1/setup`

One-time first-run bootstrap for a blank deployment where password authentication is configured and no active password-enabled platform administrator exists yet. Checks initialization state first and immediately returns 409 Conflict once initialized. Authenticates the deployment's NIU_ADMIN_TOKENS credential via Authorization: Bearer. Initializes the installation currency (defaulting to USD when omitted), grants the initial organization unlimited credit for self-use, creates the first owner account with platform administration enabled in the default workspace, establishes an eight-hour HttpOnly browser cookie when called from the trusted browser Origin, and also supports headless CLI/automation callers without an Origin header. Responses are not cached.

Operation: `completeSetup`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/setup" \
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
  "required": [
    "email",
    "password"
  ],
  "additionalProperties": false,
  "properties": {
    "name": {
      "type": "string",
      "maxLength": 100,
      "description": "Optional display name for the initial platform administrator."
    },
    "email": {
      "type": "string",
      "format": "email"
    },
    "password": {
      "type": "string",
      "minLength": 15,
      "description": "Account password (at least 15 characters and at most 1024 bytes)."
    },
    "currency": {
      "type": "string",
      "pattern": "^[A-Z]{3}$",
      "description": "Optional three-letter ISO 4217 billing currency (defaults to USD when omitted)."
    }
  }
}
```

## Responses

### HTTP 201

Initial platform administrator created and browser session established.

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
        "session"
      ],
      "properties": {
        "session": {
          "type": "object",
          "required": [
            "id",
            "operator_id",
            "expires_at_unix",
            "revoked"
          ],
          "properties": {
            "id": {
              "type": "string",
              "format": "uuid"
            },
            "operator_id": {
              "type": "string",
              "format": "uuid"
            },
            "expires_at_unix": {
              "type": "integer",
              "format": "int64"
            },
            "revoked": {
              "type": "boolean"
            }
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid email, display name, or password policy violation.

### HTTP 401

Configured NIU_ADMIN_TOKENS Bearer credential did not match.

### HTTP 403

Cross-origin browser request rejected.

### HTTP 409

Initial administrator setup has already been completed or the email is already in use.

### HTTP 429

Setup admission limit reached.

### HTTP 501

Password authentication is not configured.

## Behavior and supported scope

One-time first-run bootstrap for a blank deployment where password authentication is configured and no active password-enabled platform administrator exists yet. Checks initialization state first and immediately returns 409 Conflict once initialized. Authenticates the deployment's NIU_ADMIN_TOKENS credential via Authorization: Bearer. Initializes the installation currency (defaulting to USD when omitted), grants the initial organization unlimited credit for self-use, creates the first owner account with platform administration enabled in the default workspace, establishes an eight-hour HttpOnly browser cookie when called from the trusted browser Origin, and also supports headless CLI/automation callers without an Origin header. Responses are not cached.

**Supported scope:** implemented
