---
title: "Update Provider business profile"
description: "PATCH /api/v1/providers/{provider}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`PATCH /api/v1/providers/{provider}`

Requires platform write authority. Name is required. Omitted or null description/URL fields retain saved values; an empty string clears them. All text is trimmed. Supply the integer expected_revision to reject stale edits; omission or null preserves legacy unconditional updates. Every accepted update increments the profile revision and atomically records the authorized actor and resulting Provider name in its audit event, even if values are unchanged. URLs are stored metadata and are not fetched by this operation.

Operation: `renameProviderBusiness`.

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
curl --fail-with-body -X PATCH "$NIU_ORIGIN/api/v1/providers/{provider}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### provider

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### provider

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
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
    "name"
  ],
  "properties": {
    "name": {
      "type": "string",
      "description": "Nonblank, at most 100 UTF-8 bytes, with no control characters."
    },
    "description": {
      "type": [
        "string",
        "null"
      ],
      "description": "Up to 2,000 characters after trimming; newline, carriage return and tab are permitted."
    },
    "expected_revision": {
      "type": [
        "integer",
        "null"
      ],
      "format": "int64",
      "minimum": 1,
      "description": "Send the last read integer revision for conflict protection."
    },
    "website_url": {
      "type": [
        "string",
        "null"
      ],
      "description": "Empty to clear, null/omitted to preserve. Nonempty values must be HTTP(S) URLs with a host, no credentials or control characters and at most 2,048 UTF-8 bytes after trimming."
    },
    "logo_url": {
      "type": [
        "string",
        "null"
      ],
      "description": "Empty to clear, null/omitted to preserve. Nonempty values must be HTTP(S) URLs with a host, no credentials or control characters and at most 2,048 UTF-8 bytes after trimming."
    }
  }
}
```

## Responses

### HTTP 200

Saved Provider profile

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
        "description",
        "website_url",
        "logo_url",
        "id",
        "revision",
        "slug"
      ],
      "properties": {
        "name": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "website_url": {
          "type": "string"
        },
        "logo_url": {
          "type": "string"
        },
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "revision": {
          "type": "integer",
          "format": "int64"
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

Invalid profile fields or identifier

### HTTP 401

Authentication required

### HTTP 403

Platform write authority required

### HTTP 409

Stale revision, missing or deleted Provider

### HTTP 422

Invalid body shape or unknown field

### HTTP 503

Storage unavailable

## Behavior and supported scope

Requires platform write authority. Name is required. Omitted or null description/URL fields retain saved values; an empty string clears them. All text is trimmed. Supply the integer expected_revision to reject stale edits; omission or null preserves legacy unconditional updates. Every accepted update increments the profile revision and atomically records the authorized actor and resulting Provider name in its audit event, even if values are unchanged. URLs are stored metadata and are not fetched by this operation.

**Supported scope:** implemented
