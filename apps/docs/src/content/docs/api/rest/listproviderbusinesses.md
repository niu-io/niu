---
title: "List active Provider business identities"
description: "GET /api/v1/providers"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/providers`

Requires platform administration. Complete compatibility directory with no pagination or silent truncation, ordered by name and internal ID. Total counts retain disabled credential configurations and models. enabled_api_keys counts enabled saved configurations; enabled_model_routes counts enabled model mappings on enabled configurations. These counts do not verify credentials, upstream availability, customer pricing or request authorization. Member counts include active memberships for non-revoked operators. Deleted Providers are excluded. Qualification is explicit and never inferred from configuration counts.

Operation: `listProviderBusinesses`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/providers" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Active directory

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "name",
          "logo_url",
          "api_keys",
          "models",
          "members",
          "qualification_status",
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
          "logo_url": {
            "type": "string",
            "description": "Saved Provider logo URL; empty uses the default logo."
          },
          "api_keys": {
            "type": "integer",
            "minimum": 0
          },
          "models": {
            "type": "integer",
            "minimum": 0
          },
          "members": {
            "type": "integer",
            "minimum": 0
          },
          "offers": {
            "type": "integer",
            "minimum": 0,
            "description": "Saved model offers with agreed Provider rates."
          },
          "ready_offers": {
            "type": "integer",
            "minimum": 0,
            "description": "Active offers with current Provider and exact offer/rate qualification, enabled matching routes and saved credentials. Customer selling prices and authorization remain workspace-specific; this is not a live health check."
          },
          "enabled_api_keys": {
            "type": "integer",
            "minimum": 0
          },
          "enabled_model_routes": {
            "type": "integer",
            "minimum": 0
          },
          "qualification_status": {
            "type": "string",
            "enum": [
              "qualified",
              "unqualified"
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

Missing, expired or revoked administrative credential

### HTTP 403

Platform administration required

### HTTP 503

Storage unavailable

## Behavior and supported scope

Requires platform administration. Complete compatibility directory with no pagination or silent truncation, ordered by name and internal ID. Total counts retain disabled credential configurations and models. enabled_api_keys counts enabled saved configurations; enabled_model_routes counts enabled model mappings on enabled configurations. These counts do not verify credentials, upstream availability, customer pricing or request authorization. Member counts include active memberships for non-revoked operators. Deleted Providers are excluded. Qualification is explicit and never inferred from configuration counts.

**Supported scope:** implemented
