---
title: "Read immutable model candidate pool revisions"
description: "GET /admin/v1/model-route-pools/history"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/model-route-pools/history`

Platform administration required: installation credentials or an explicitly authorized platform administrator. Ordinary company/workspace ownership does not grant this access.

Operation: `listModelRoutePoolHistory`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/model-route-pools/history" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

### alias

Location: **query**. **Required.**

```json
{
  "type": "string"
}
```

### before_revision

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

At most 100 immutable revisions in descending order

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
      "maxItems": 100,
      "items": {
        "allOf": [
          {
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
          },
          {
            "type": "object",
            "required": [
              "recorded_at"
            ],
            "properties": {
              "recorded_at": {
                "type": "string",
                "format": "date-time"
              }
            }
          }
        ]
      }
    }
  }
}
```

### HTTP 400

Invalid query or revision cursor; framework query errors may use plain text.

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 404

Pool not found

## Behavior and supported scope

Platform administration required: installation credentials or an explicitly authorized platform administrator. Ordinary company/workspace ownership does not grant this access.

**Supported scope:** implemented
