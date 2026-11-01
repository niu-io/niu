---
title: "Read the retired Provider portal membership directory"
description: "GET /api/v1/provider-memberships"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/provider-memberships`

Requires platform administration and returns an empty compatibility directory. Provider self-service is not currently supported. Retained Provider membership records grant no role, portal, financial or statistics access.

Operation: `listProviderMemberships`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/provider-memberships" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Empty compatibility directory; no Provider login role is available.

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
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "name",
          "role",
          "slug"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "name": {
            "type": "string"
          },
          "role": {
            "type": "string",
            "enum": [
              "manager",
              "viewer"
            ]
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
}
```

### HTTP 401

Missing or unusable session.

### HTTP 403

Active platform administration required; Provider membership alone grants no access.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Requires platform administration and returns an empty compatibility directory. Provider self-service is not currently supported. Retained Provider membership records grant no role, portal, financial or statistics access.

**Supported scope:** implemented
