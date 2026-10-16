---
title: "Inspect the current workspace API key"
description: "GET /v1/key"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/key`

Returns the existing customer-safe key projection: object, label, allowed_models, expires_at_ms and last_used_at_ms (Unix milliseconds), revoked/expired flags, spending_limits (limit_nanos, committed_nanos, remaining_nanos), flat rate_limits, usage_window and allowed_cidrs. Does not rename fields or change the HTTP response. Workspace policies and live authorization still apply. Unknown usage remains explicit and model grants do not establish upstream availability. Authenticates an inference API key, or the workspace key selected via X-Niu-Key-Id with an authorized console session. Never returns the secret token, internal platform UUIDs or Provider procurement costs.

Operation: `getCurrentKey`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  },
  {
    "niuApiKeyAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/key" \
  -H "Authorization: Bearer $NIU_API_KEY"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Current API key metadata, limits, and usage.

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
        "object",
        "label",
        "allowed_models",
        "expires_at_ms",
        "last_used_at_ms",
        "revoked",
        "expired",
        "spending_limits",
        "rate_limits",
        "usage_window",
        "allowed_cidrs"
      ],
      "properties": {
        "object": {
          "type": "string",
          "const": "api_key"
        },
        "label": {
          "type": "string"
        },
        "allowed_models": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "expires_at_ms": {
          "type": [
            "integer",
            "null"
          ],
          "format": "int64",
          "description": "Unix milliseconds, never seconds. Null means no automatic expiration; revocation and policies still apply."
        },
        "last_used_at_ms": {
          "type": [
            "integer",
            "null"
          ],
          "format": "int64",
          "description": "Last dispatch time in Unix milliseconds, or null when no dispatch is recorded."
        },
        "revoked": {
          "type": "boolean"
        },
        "expired": {
          "type": "boolean"
        },
        "spending_limits": {
          "type": "array",
          "description": "Customer spending policies by currency. A null limit is unlimited; a null remaining value is not a zero allowance. Amounts are exact integer nanounit strings.",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "currency",
              "limit_nanos",
              "committed_nanos",
              "remaining_nanos"
            ],
            "properties": {
              "currency": {
                "type": "string"
              },
              "limit_nanos": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^[0-9]+$"
              },
              "committed_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "remaining_nanos": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^[0-9]+$"
              }
            }
          }
        },
        "rate_limits": {
          "type": "object",
          "additionalProperties": false,
          "description": "Null policy limits mean unlimited; a known zero blocks requests under that policy.",
          "required": [
            "requests_per_minute",
            "tokens_per_minute",
            "max_concurrent_requests",
            "active_requests"
          ],
          "properties": {
            "requests_per_minute": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 0
            },
            "tokens_per_minute": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 0
            },
            "max_concurrent_requests": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 0
            },
            "active_requests": {
              "type": "integer",
              "minimum": 0
            }
          }
        },
        "usage_window": {
          "type": "object",
          "additionalProperties": false,
          "description": "Known token subtotals are not complete usage when unknown_usage_requests is positive.",
          "required": [
            "window_seconds",
            "window_end",
            "requests",
            "known_usage_requests",
            "unknown_usage_requests",
            "known_prompt_tokens",
            "known_completion_tokens"
          ],
          "properties": {
            "window_seconds": {
              "type": "integer",
              "const": 60
            },
            "window_end": {
              "type": "string",
              "format": "date-time"
            },
            "requests": {
              "type": "integer",
              "minimum": 0
            },
            "known_usage_requests": {
              "type": "integer",
              "minimum": 0
            },
            "unknown_usage_requests": {
              "type": "integer",
              "minimum": 0
            },
            "known_prompt_tokens": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "known_completion_tokens": {
              "type": "string",
              "pattern": "^[0-9]+$"
            }
          }
        },
        "allowed_cidrs": {
          "type": [
            "array",
            "null"
          ],
          "items": {
            "type": "string"
          },
          "description": "Current source-IP allowlist, or null for no allowlist restriction."
        }
      }
    }
  }
}
```

### HTTP 401

Missing, revoked, expired or invalid key.

## Behavior and supported scope

Returns the existing customer-safe key projection: object, label, allowed_models, expires_at_ms and last_used_at_ms (Unix milliseconds), revoked/expired flags, spending_limits (limit_nanos, committed_nanos, remaining_nanos), flat rate_limits, usage_window and allowed_cidrs. Does not rename fields or change the HTTP response. Workspace policies and live authorization still apply. Unknown usage remains explicit and model grants do not establish upstream availability. Authenticates an inference API key, or the workspace key selected via X-Niu-Key-Id with an authorized console session. Never returns the secret token, internal platform UUIDs or Provider procurement costs.

**Supported scope:** implemented
