---
title: "Inspect operational usage of Provider-owned configurations"
description: "GET /admin/v1/providers/{provider}/configuration-usage"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/providers/{provider}/configuration-usage`

Installation credential or explicit platform administrator required. Provider membership and customer roles do not grant access. Uses current explicit configuration ownership and persisted managed/media request routes; includes disabled configurations and does not infer unbound legacy/static traffic. This is current-configuration operational history, not historical financial attribution, qualified commercial supply, earnings or settlement. Counts each dispatched attempt once, including retry attempts. From is inclusive, to exclusive, in epoch milliseconds; maximum range 90 days. Token sums include only complete provider-reported aggregate token usage; unknown requests and non-token media remain separately counted. Failures count persisted safe failure observations, not an inference that every unsuccessful request has one. Timing counts refer to recorded HTTP delivery, not video job completion. Totals cover the whole range regardless of model page. after is an exclusive lexical model-alias boundary, not an identity lookup; pages are live statement snapshots. No customer identity, request/key IDs, endpoint, credentials, costs or prices are returned. No upstream call or mutation. Cache-Control no-store.

Operation: `getProviderConfigurationUsage`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/providers/{provider}/configuration-usage" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

### provider

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### from_ms

Location: **query**. **Required.**

```json
{
  "type": "integer",
  "minimum": 0,
  "maximum": 253402300799999
}
```

### to_ms

Location: **query**. **Required.**

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 253402300799999
}
```

### after

Location: **query**. Optional.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 256
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

Scoped operational counts; not supply or financial qualification.

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
      "additionalProperties": false,
      "required": [
        "from_ms",
        "to_ms",
        "observed_at",
        "totals",
        "models",
        "next_after"
      ],
      "properties": {
        "from_ms": {
          "type": "integer"
        },
        "to_ms": {
          "type": "integer"
        },
        "observed_at": {
          "type": "string",
          "format": "date-time"
        },
        "totals": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "requests",
            "completed",
            "execution_unknown",
            "known_token_usage_requests",
            "unknown_token_usage_requests",
            "prompt_tokens",
            "completion_tokens",
            "failures",
            "observed_timing_requests",
            "complete_timing_requests",
            "complete_total_ms"
          ],
          "properties": {
            "requests": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "completed": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "execution_unknown": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "known_token_usage_requests": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "unknown_token_usage_requests": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "prompt_tokens": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "completion_tokens": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "failures": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "observed_timing_requests": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "complete_timing_requests": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "complete_total_ms": {
              "type": [
                "string",
                "null"
              ],
              "pattern": "^[0-9]+$",
              "description": "Sum of complete observed HTTP delivery durations; null without any complete timing. Not asynchronous job duration."
            }
          }
        },
        "models": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "requests",
              "completed",
              "execution_unknown",
              "known_token_usage_requests",
              "unknown_token_usage_requests",
              "prompt_tokens",
              "completion_tokens",
              "failures",
              "observed_timing_requests",
              "complete_timing_requests",
              "complete_total_ms",
              "model"
            ],
            "properties": {
              "requests": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "completed": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "execution_unknown": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "known_token_usage_requests": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "unknown_token_usage_requests": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "prompt_tokens": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "completion_tokens": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "failures": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "observed_timing_requests": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "complete_timing_requests": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "complete_total_ms": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^[0-9]+$",
                "description": "Sum of complete observed HTTP delivery durations; null without any complete timing. Not asynchronous job duration."
              },
              "model": {
                "type": "string"
              }
            }
          }
        },
        "next_after": {
          "type": [
            "string",
            "null"
          ]
        }
      }
    }
  },
  "additionalProperties": false
}
```

### HTTP 400

Invalid interval, cursor boundary, limit or query.

### HTTP 401

Authentication required.

### HTTP 403

Platform administration required.

### HTTP 404

Provider does not exist or is deleted.

### HTTP 503

Storage unavailable or diagnostic query deadline exceeded; no partial totals.

## Behavior and supported scope

Installation credential or explicit platform administrator required. Provider membership and customer roles do not grant access. Uses current explicit configuration ownership and persisted managed/media request routes; includes disabled configurations and does not infer unbound legacy/static traffic. This is current-configuration operational history, not historical financial attribution, qualified commercial supply, earnings or settlement. Counts each dispatched attempt once, including retry attempts. From is inclusive, to exclusive, in epoch milliseconds; maximum range 90 days. Token sums include only complete provider-reported aggregate token usage; unknown requests and non-token media remain separately counted. Failures count persisted safe failure observations, not an inference that every unsuccessful request has one. Timing counts refer to recorded HTTP delivery, not video job completion. Totals cover the whole range regardless of model page. after is an exclusive lexical model-alias boundary, not an identity lookup; pages are live statement snapshots. No customer identity, request/key IDs, endpoint, credentials, costs or prices are returned. No upstream call or mutation. Cache-Control no-store.

**Supported scope:** implemented
