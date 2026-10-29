---
title: "Exchange member credentials for a scoped eight-hour session"
description: "POST /api/v1/auth/login"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/auth/login`

JSON bodies are limited to 4096 bytes. Unknown identities and incorrect passwords return the same 401 response. Durable limits allow five attempts per normalized email and 120 per installation in windows expiring 60 seconds after their first attempt. A supplied Origin must match the configured HTTPS origin. All success and error responses are non-cacheable.

Operation: `createPasswordSession`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

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
      "description": "ASCII email; surrounding spaces and case are normalized."
    },
    "password": {
      "type": "string",
      "maxLength": 1024,
      "description": "At most 1024 UTF-8 bytes; no trimming or normalization."
    }
  }
}
```

## Responses

### HTTP 200

Session token returned once; use it as a Bearer credential.

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
    "token",
    "session"
  ],
  "properties": {
    "token": {
      "type": "string"
    },
    "session": {
      "type": "object",
      "additionalProperties": false,
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
          "type": "integer"
        },
        "revoked": {
          "type": "boolean"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid or oversized JSON request.

### HTTP 401

Email or password is incorrect, or the member was revoked during verification.

### HTTP 403

Supplied browser Origin is not permitted.

### HTTP 429

Durable admission limit or bounded password-worker capacity reached.

Response headers:

```json
{
  "Retry-After": {
    "schema": {
      "type": "string",
      "const": "60"
    }
  },
  "Cache-Control": {
    "schema": {
      "type": "string",
      "const": "no-store"
    }
  }
}
```

### HTTP 501

Password sign-in has not been configured.

### HTTP 503

Durable storage or credential processing is unavailable; no session token is returned.

## Behavior and supported scope

JSON bodies are limited to 4096 bytes. Unknown identities and incorrect passwords return the same 401 response. Durable limits allow five attempts per normalized email and 120 per installation in windows expiring 60 seconds after their first attempt. A supplied Origin must match the configured HTTPS origin. All success and error responses are non-cacheable.
