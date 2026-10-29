---
title: "Read immutable model candidate pool revisions"
description: "GET /api/v1/pools/{reference}/history"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/pools/{reference}/history`

Platform administration required: installation credentials or an explicitly authorized platform administrator. Ordinary company/workspace ownership does not grant this access. Reference is the canonical unpadded base64url encoding of the exact alias, not a percent-encoded alias; noncanonical or invalid references return 400.

Operation: `listPoolHistory`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/pools/{reference}/history" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### reference

Location: **path**. **Required.** Unpadded base64url encoding of the exact ASCII pool alias. This avoids encoded slashes and double decoding by proxies. The decoded alias must be 1–200 visible ASCII bytes.

```json
{
  "type": "string",
  "minLength": 2,
  "maxLength": 267,
  "pattern": "^[A-Za-z0-9_-]+$"
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
              "project_id": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "uuid"
              },
              "display_name": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "description": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "slug": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "public_catalog": {
                "type": "boolean"
              },
              "billing_mode": {
                "type": "string",
                "enum": [
                  "pool_tariff",
                  "candidate_tariff"
                ]
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
              },
              "rules": {
                "type": "array",
                "maxItems": 32,
                "items": {
                  "type": "object"
                }
              },
              "default_action": {
                "type": "string",
                "enum": [
                  "candidates",
                  "reject"
                ]
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

Platform administration required: installation credentials or an explicitly authorized platform administrator. Ordinary company/workspace ownership does not grant this access. Reference is the canonical unpadded base64url encoding of the exact alias, not a percent-encoded alias; noncanonical or invalid references return 400.

**Supported scope:** implemented
