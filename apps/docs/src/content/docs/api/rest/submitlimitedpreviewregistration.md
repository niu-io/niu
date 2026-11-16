---
title: "Request a Limited Preview account pending administrator approval"
description: "POST /api/v1/auth/registrations"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/auth/registrations`

Public capability gated by NIU_AUTH_PUBLIC_ORIGIN and the configured registration policy. Requires the configured HTTPS Origin header. Passwords are validated (minimum 15 characters, maximum 1024 UTF-8 bytes) and Argon2id-hashed at submission time; no plaintext password is stored. No email provider is required: once approved by an administrator, the applicant signs in immediately with the submitted email and password. Existing accounts and duplicate pending emails return the same 202 response without overwriting credentials. Responses use Cache-Control no-store.

Operation: `submitLimitedPreviewRegistration`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/auth/registrations" \
  -H 'Origin: <ORIGIN>' \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### Origin

Location: **header**. **Required.**

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
    "name",
    "email",
    "password"
  ],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    },
    "email": {
      "type": "string",
      "maxLength": 254
    },
    "password": {
      "type": "string",
      "minLength": 15,
      "maxLength": 1024,
      "writeOnly": true
    },
    "organization_name": {
      "type": "string",
      "maxLength": 120
    },
    "workspace_name": {
      "type": "string",
      "maxLength": 120
    },
    "note": {
      "type": "string",
      "maxLength": 500
    }
  }
}
```

## Responses

### HTTP 202

Registration accepted for Limited Preview administrator review.

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
    "status"
  ],
  "properties": {
    "status": {
      "type": "string",
      "const": "pending_approval"
    }
  }
}
```

### HTTP 400

Invalid registration fields or password policy failure.

### HTTP 403

Registration is disabled on this deployment or Origin rejected.

### HTTP 429

Registration submission rate limit or worker capacity reached.

Response headers:

```json
{
  "Retry-After": {
    "schema": {
      "type": "string",
      "const": "60"
    }
  }
}
```

### HTTP 501

Password authentication is not configured on this deployment.

### HTTP 503

Durable storage or credential processing is unavailable.

## Behavior and supported scope

Public capability gated by NIU_AUTH_PUBLIC_ORIGIN and the configured registration policy. Requires the configured HTTPS Origin header. Passwords are validated (minimum 15 characters, maximum 1024 UTF-8 bytes) and Argon2id-hashed at submission time; no plaintext password is stored. No email provider is required: once approved by an administrator, the applicant signs in immediately with the submitted email and password. Existing accounts and duplicate pending emails return the same 202 response without overwriting credentials. Responses use Cache-Control no-store.

**Supported scope:** implemented
