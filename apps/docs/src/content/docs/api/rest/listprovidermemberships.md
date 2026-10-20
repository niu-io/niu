---
title: "List the signed-in operator’s complete active Provider memberships"
description: "GET /api/v1/provider-memberships"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/provider-memberships`

Returns every active membership for the current non-revoked operator, ordered by Provider name then internal routing ID. This compatibility directory has no cursor or silent history cap. Installation sessions return an empty list. Company membership alone grants no Provider access. Deleted Providers are excluded. IDs are routing references, not display labels.

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

Complete current membership directory.

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

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Returns every active membership for the current non-revoked operator, ordered by Provider name then internal routing ID. This compatibility directory has no cursor or silent history cap. Installation sessions return an empty list. Company membership alone grants no Provider access. Deleted Providers are excluded. IDs are routing references, not display labels.

**Supported scope:** implemented
