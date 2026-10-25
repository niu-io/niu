---
title: "Read an original saved billing-mode preview"
description: "GET /api/v1/platform/units/mode/previews/{preview}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/platform/units/mode/previews/{preview}`

Platform administration required. Returns the immutable original snapshot, including expired or subsequently incompatible previews. Reading does not renew expiry or authorize a switch. Current compatibility can differ; publication always rechecks it.

Operation: `getSavedCustomerUnitModePreview`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/platform/units/mode/previews/{preview}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### preview

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Original durable result

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
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "expected_revision",
        "source_mode",
        "target_mode",
        "snapshot",
        "created_at",
        "expires_at"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "expected_revision": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "source_mode": {
          "type": "string",
          "enum": [
            "currency",
            "credits"
          ]
        },
        "target_mode": {
          "type": "string",
          "enum": [
            "currency",
            "credits"
          ]
        },
        "snapshot": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "revision",
            "billing_mode",
            "target_mode",
            "change_required",
            "blockers_empty",
            "observed_at",
            "blockers",
            "preserved_configuration"
          ],
          "properties": {
            "revision": {
              "type": "string",
              "pattern": "^(0|[1-9][0-9]*)$"
            },
            "billing_mode": {
              "type": "string",
              "enum": [
                "currency",
                "credits"
              ]
            },
            "target_mode": {
              "type": "string",
              "enum": [
                "currency",
                "credits"
              ]
            },
            "change_required": {
              "type": "boolean"
            },
            "blockers_empty": {
              "type": "boolean"
            },
            "observed_at": {
              "type": "string",
              "format": "date-time"
            },
            "blockers": {
              "type": "array",
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "category",
                  "record_count",
                  "organization_count",
                  "accounts_truncated",
                  "accounts"
                ],
                "properties": {
                  "category": {
                    "type": "string"
                  },
                  "record_count": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]*)$"
                  },
                  "organization_count": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]*)$"
                  },
                  "accounts_truncated": {
                    "type": "boolean"
                  },
                  "accounts": {
                    "type": "array",
                    "maxItems": 100,
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "organization_id",
                        "name",
                        "record_count"
                      ],
                      "properties": {
                        "organization_id": {
                          "type": "string",
                          "format": "uuid"
                        },
                        "name": {
                          "type": "string"
                        },
                        "record_count": {
                          "type": "string",
                          "pattern": "^(0|[1-9][0-9]*)$"
                        }
                      }
                    }
                  }
                }
              }
            },
            "preserved_configuration": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "monetary_workspace_limits",
                "monetary_key_limits",
                "monetary_text_tariffs",
                "credits_text_tariffs",
                "monetary_retail_prices",
                "monetary_media_rate_history"
              ],
              "properties": {
                "monetary_workspace_limits": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]*)$"
                },
                "monetary_key_limits": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]*)$"
                },
                "monetary_text_tariffs": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]*)$"
                },
                "credits_text_tariffs": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]*)$"
                },
                "monetary_retail_prices": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]*)$"
                },
                "monetary_media_rate_history": {
                  "type": "string",
                  "pattern": "^(0|[1-9][0-9]*)$"
                }
              }
            }
          }
        },
        "created_at": {
          "type": "string",
          "format": "date-time"
        },
        "expires_at": {
          "type": "string",
          "format": "date-time"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid input

### HTTP 401

Authentication required or revoked

### HTTP 403

Platform administration required

### HTTP 404

Saved preview not found

### HTTP 409

Stale, incompatible, expired or conflicting intent; concurrent financial activity

### HTTP 422

Malformed request

### HTTP 503

Storage unavailable

## Behavior and supported scope

Platform administration required. Returns the immutable original snapshot, including expired or subsequently incompatible previews. Reading does not renew expiry or authorize a switch. Current compatibility can differ; publication always rechecks it.

**Supported scope:** implemented
