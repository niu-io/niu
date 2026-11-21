---
title: "Create the first platform administrator account during initial setup"
description: "POST /api/v1/setup"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/setup`

One-time first-run bootstrap for a blank deployment where browser password authentication is enabled and no active password-enabled platform administrator exists yet. Requires the configured browser Origin and a valid administrator token from NIU_ADMIN_TOKENS. Creates the first owner account with platform administration enabled in the default workspace, issues an eight-hour HttpOnly browser session cookie with platform administrator mode active, and rejects subsequent calls with 409 Conflict. Responses are not cached.

Operation: `completeInitialInstallationSetup`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/setup" \
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
    "administrator_token",
    "email",
    "password"
  ],
  "additionalProperties": false,
  "properties": {
    "administrator_token": {
      "type": "string",
      "description": "Bootstrap administrator credential configured in NIU_ADMIN_TOKENS."
    },
    "name": {
      "type": "string",
      "description": "Optional display name for the initial platform administrator (max 100 characters)."
    },
    "email": {
      "type": "string",
      "format": "email"
    },
    "password": {
      "type": "string",
      "minLength": 15,
      "description": "Account password (at least 15 characters and at most 1024 bytes)."
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
    "session"
  ],
  "properties": {
    "session": {
      "type": "object"
    }
  }
}
```

### HTTP 400

Invalid email, display name, or password policy violation.

### HTTP 401

Configured NIU_ADMIN_TOKENS credential did not match.

### HTTP 403

Browser origin rejected.

### HTTP 409

Initial administrator setup has already been completed or the email is already in use.

### HTTP 429

Setup admission limit reached.

### HTTP 501

Browser password authentication is not configured.

## Behavior and supported scope

One-time first-run bootstrap for a blank deployment where browser password authentication is enabled and no active password-enabled platform administrator exists yet. Requires the configured browser Origin and a valid administrator token from NIU_ADMIN_TOKENS. Creates the first owner account with platform administration enabled in the default workspace, issues an eight-hour HttpOnly browser session cookie with platform administrator mode active, and rejects subsequent calls with 409 Conflict. Responses are not cached.

**Supported scope:** implemented
