---
title: "Preview installation billing-mode incompatibilities"
description: "GET /api/v1/platform/units/mode"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/platform/units/mode`

Platform administration required. One current database statement reports incompatible customer balances, credit facilities, pending checkouts, unposted charges, unresolved customer requests and reservations, unapplied monetary grant intents and remaining unexpired Credits. Enabling Credits additionally requires a unit definition and matching platform-currency purchase rule. Each category includes complete counts and at most 100 affected company accounts, with explicit truncation. Original tariffs and monetary limits are retained and summarized, never converted. Existing monetary limits still require explicit compatible Credits configuration before those workspaces or keys can spend Credits. This is advisory only: blockers_empty does not activate billing mode, prove route readiness or authorize a later switch. Any mode publication must revalidate current state atomically. Reads never modify accounts or history. Same-mode previews still report current incompatibilities. No procurement amounts or credentials are included. Internal account identifiers are routing references, not display labels.

Operation: `getCustomerUnitModePreview`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/platform/units/mode" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  --url-query 'target=<TARGET>'
```

## Parameters

### target

Location: **query**. **Required.**

```json
{
  "type": "string",
  "enum": [
    "currency",
    "credits"
  ]
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Current advisory compatibility snapshot

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
    }
  }
}
```

### HTTP 400

Invalid target or query

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 503

Storage unavailable

## Behavior and supported scope

Platform administration required. One current database statement reports incompatible customer balances, credit facilities, pending checkouts, unposted charges, unresolved customer requests and reservations, unapplied monetary grant intents and remaining unexpired Credits. Enabling Credits additionally requires a unit definition and matching platform-currency purchase rule. Each category includes complete counts and at most 100 affected company accounts, with explicit truncation. Original tariffs and monetary limits are retained and summarized, never converted. Existing monetary limits still require explicit compatible Credits configuration before those workspaces or keys can spend Credits. This is advisory only: blockers_empty does not activate billing mode, prove route readiness or authorize a later switch. Any mode publication must revalidate current state atomically. Reads never modify accounts or history. Same-mode previews still report current incompatibilities. No procurement amounts or credentials are included. Internal account identifiers are routing references, not display labels.

**Supported scope:** implemented
