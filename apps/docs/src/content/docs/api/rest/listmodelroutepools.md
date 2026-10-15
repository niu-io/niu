---
title: "List platform-managed model route pools"
description: "GET /api/v1/model-route-pools/index"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/model-route-pools/index`

Installation credential or explicit platform-administrator grant required. Lists enabled and disabled shared and personal pools with their current configuration. Ordered by alias using database ordering. after is the exclusive alias cursor returned as next_after; it need not identify a currently existing pool. This is a live view, not a cross-page snapshot: new aliases before the cursor require a fresh traversal. No upstream requests, credentials, endpoints or prices are returned. Pool organization identifiers are API references, not display labels.

Operation: `listModelRoutePools`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/model-route-pools/index" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
```

## Parameters

### after

Location: **query**. Optional.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 200,
  "pattern": "^[!-~]+$"
}
```

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 50
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Bounded current configurations and continuation cursor.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "has_more",
    "next_after"
  ],
  "additionalProperties": false,
  "properties": {
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "required": [
          "alias",
          "organization_id",
          "enabled",
          "revision",
          "candidates"
        ],
        "properties": {
          "alias": {
            "type": "string"
          },
          "organization_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "enabled": {
            "type": "boolean"
          },
          "revision": {
            "type": "integer",
            "minimum": 1,
            "maximum": 9007199254740991
          },
          "candidates": {
            "type": "array",
            "minItems": 1,
            "maxItems": 64,
            "items": {
              "type": "object",
              "required": [
                "alias",
                "priority",
                "weight",
                "enabled"
              ],
              "properties": {
                "alias": {
                  "type": "string"
                },
                "priority": {
                  "type": "integer",
                  "minimum": -1000,
                  "maximum": 1000
                },
                "weight": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 10000
                },
                "enabled": {
                  "type": "boolean"
                }
              }
            }
          }
        }
      }
    },
    "has_more": {
      "type": "boolean"
    },
    "next_after": {
      "type": [
        "string",
        "null"
      ]
    }
  }
}
```

### HTTP 400

Invalid query, alias cursor or page size; framework query errors may use plain text.

### HTTP 401

Authentication required.

### HTTP 403

Platform administration required.

## Behavior and supported scope

Installation credential or explicit platform-administrator grant required. Lists enabled and disabled shared and personal pools with their current configuration. Ordered by alias using database ordering. after is the exclusive alias cursor returned as next_after; it need not identify a currently existing pool. This is a live view, not a cross-page snapshot: new aliases before the cursor require a fresh traversal. No upstream requests, credentials, endpoints or prices are returned. Pool organization identifiers are API references, not display labels.

**Supported scope:** implemented
