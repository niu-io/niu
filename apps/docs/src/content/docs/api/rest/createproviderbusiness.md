---
title: "Create a Provider business identity"
description: "POST /api/v1/providers"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/providers`

Requires platform administration. Creation grants no membership, qualification, offer or permission to resell supply. Atomically stores the trimmed name, optional description, website and logo URLs with an immutable creation audit. Optional profile fields default to empty strings. Saving URLs does not fetch them.

Operation: `createProviderBusiness`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/providers" \
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
    "name"
  ],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100,
      "description": "Nonblank after trimming; at most 100 UTF-8 bytes before trimming; no control characters. Saved value is trimmed."
    },
    "description": {
      "type": "string",
      "maxLength": 2000,
      "description": "Optional business description, trimmed before saving. Newlines and tabs are allowed; other control characters are rejected."
    },
    "website_url": {
      "type": "string",
      "maxLength": 2048,
      "description": "Optional HTTP or HTTPS website URL without embedded credentials. Trimmed before saving; empty string leaves the website unset."
    },
    "logo_url": {
      "type": "string",
      "maxLength": 2048,
      "description": "Optional HTTP or HTTPS image URL without embedded credentials. Trimmed before saving; empty string uses the default logo."
    }
  }
}
```

## Responses

### HTTP 200

Created identity

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
        "id",
        "slug"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "slug": {
          "type": "string",
          "maxLength": 48,
          "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
          "description": "Stable readable slug for product URLs. Renaming preserves it."
        }
      }
    }
  }
}
```

### HTTP 400

Invalid Provider name or profile metadata

### HTTP 401

Missing, expired or revoked administrative credential

### HTTP 403

Platform administration required

### HTTP 422

Malformed body or unknown field

### HTTP 503

Storage unavailable

## Behavior and supported scope

Requires platform administration. Creation grants no membership, qualification, offer or permission to resell supply. Atomically stores the trimmed name, optional description, website and logo URLs with an immutable creation audit. Optional profile fields default to empty strings. Saving URLs does not fetch them.

**Supported scope:** implemented
