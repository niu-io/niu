---
title: "Inspect the current workspace API key"
description: "GET /v1/key"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/key`

Returns customer-safe metadata, model grants, expiration, spending limits and remaining allowance, request/token/concurrency rate limits, 60-second usage window, and IP allowlist for the authenticated API key (or the workspace key selected via X-Niu-Key-Id with a console session). Never returns the secret token or internal platform UUIDs.

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
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "required": [
        "label",
        "allowed_models",
        "expires_at",
        "spending_limits",
        "request_rate_limit",
        "token_rate_limit",
        "concurrency_limit",
        "usage_window",
        "ip_policy"
      ],
      "properties": {
        "label": {
          "type": "string"
        },
        "allowed_models": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "expires_at": {
          "type": [
            "integer",
            "null"
          ],
          "format": "int64"
        },
        "spending_limits": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "currency",
              "enabled",
              "max_amount_nanos",
              "settled_amount_nanos",
              "reserved_amount_nanos",
              "remaining_allowance_nanos"
            ],
            "properties": {
              "currency": {
                "type": "string"
              },
              "enabled": {
                "type": "boolean"
              },
              "max_amount_nanos": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "settled_amount_nanos": {
                "type": "string"
              },
              "reserved_amount_nanos": {
                "type": "string"
              },
              "remaining_allowance_nanos": {
                "type": [
                  "string",
                  "null"
                ]
              }
            }
          }
        },
        "request_rate_limit": {
          "type": "object",
          "required": [
            "enabled",
            "requests_per_minute",
            "window_seconds",
            "observed_requests_in_window",
            "remaining_requests_in_window"
          ],
          "properties": {
            "enabled": {
              "type": "boolean"
            },
            "requests_per_minute": {
              "type": [
                "integer",
                "null"
              ]
            },
            "window_seconds": {
              "type": "integer"
            },
            "observed_requests_in_window": {
              "type": "integer"
            },
            "remaining_requests_in_window": {
              "type": [
                "integer",
                "null"
              ]
            }
          }
        },
        "token_rate_limit": {
          "type": "object",
          "required": [
            "enabled",
            "tokens_per_minute",
            "window_seconds",
            "observed_tokens_in_window",
            "remaining_tokens_in_window"
          ],
          "properties": {
            "enabled": {
              "type": "boolean"
            },
            "tokens_per_minute": {
              "type": [
                "string",
                "null"
              ]
            },
            "window_seconds": {
              "type": "integer"
            },
            "observed_tokens_in_window": {
              "type": "string"
            },
            "remaining_tokens_in_window": {
              "type": [
                "string",
                "null"
              ]
            }
          }
        },
        "concurrency_limit": {
          "type": "object",
          "required": [
            "enabled",
            "max_concurrent_requests",
            "in_flight_requests",
            "remaining_concurrent_requests"
          ],
          "properties": {
            "enabled": {
              "type": "boolean"
            },
            "max_concurrent_requests": {
              "type": [
                "integer",
                "null"
              ]
            },
            "in_flight_requests": {
              "type": "integer"
            },
            "remaining_concurrent_requests": {
              "type": [
                "integer",
                "null"
              ]
            }
          }
        },
        "usage_window": {
          "type": "object",
          "required": [
            "window_seconds",
            "request_count",
            "known_usage_requests",
            "unknown_usage_requests",
            "prompt_tokens",
            "completion_tokens",
            "total_tokens"
          ],
          "properties": {
            "window_seconds": {
              "type": "integer"
            },
            "request_count": {
              "type": "integer"
            },
            "known_usage_requests": {
              "type": "integer"
            },
            "unknown_usage_requests": {
              "type": "integer"
            },
            "prompt_tokens": {
              "type": "string"
            },
            "completion_tokens": {
              "type": "string"
            },
            "total_tokens": {
              "type": "string"
            }
          }
        },
        "ip_policy": {
          "type": "object",
          "required": [
            "enabled",
            "allowed_cidrs"
          ],
          "properties": {
            "enabled": {
              "type": "boolean"
            },
            "allowed_cidrs": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          }
        }
      }
    }
  }
}
```

### HTTP 401

Missing, revoked, expired or invalid key.

## Behavior and supported scope

Returns customer-safe metadata, model grants, expiration, spending limits and remaining allowance, request/token/concurrency rate limits, 60-second usage window, and IP allowlist for the authenticated API key (or the workspace key selected via X-Niu-Key-Id with a console session). Never returns the secret token or internal platform UUIDs.

**Supported scope:** implemented
