---
title: "Get generation usage, latency, and customer charge by ID"
description: "GET /v1/generations/{id}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/generations/{id}`

Returns token breakdown, latency/timing observations, execution status, and customer-facing charge for a generation attempt in the authenticated key's workspace. Never exposes Provider purchase costs, platform margins, or internal correlation UUIDs.

Operation: `getGeneration`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

Authentication alternative: `bearerAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/generations/{id}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/generations/{id}" \
  -H "X-Niu-API-Key: $NIU_API_KEY"
```

## Parameters

### id

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

Generation telemetry and customer charge.

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
        "id",
        "model",
        "request_kind",
        "created_at",
        "execution",
        "usage_confidence",
        "usage",
        "customer_charge"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "model": {
          "type": "string"
        },
        "provider_model": {
          "type": [
            "string",
            "null"
          ]
        },
        "request_kind": {
          "type": "string",
          "enum": [
            "inference",
            "video"
          ]
        },
        "created_at": {
          "type": "string",
          "format": "date-time"
        },
        "dispatched_at": {
          "type": [
            "string",
            "null"
          ],
          "format": "date-time"
        },
        "completed_at": {
          "type": [
            "string",
            "null"
          ],
          "format": "date-time"
        },
        "duration_ms": {
          "type": [
            "integer",
            "null"
          ]
        },
        "execution": {
          "type": "string"
        },
        "usage_confidence": {
          "type": "string"
        },
        "usage": {
          "type": "object",
          "required": [
            "prompt_tokens",
            "completion_tokens",
            "cached_input_tokens",
            "cache_write_input_tokens",
            "reasoning_output_tokens"
          ],
          "properties": {
            "prompt_tokens": {
              "type": [
                "string",
                "null"
              ]
            },
            "completion_tokens": {
              "type": [
                "string",
                "null"
              ]
            },
            "cached_input_tokens": {
              "type": [
                "string",
                "null"
              ]
            },
            "cache_write_input_tokens": {
              "type": [
                "string",
                "null"
              ]
            },
            "reasoning_output_tokens": {
              "type": [
                "string",
                "null"
              ]
            }
          }
        },
        "customer_charge": {
          "type": "object",
          "required": [
            "status",
            "currency",
            "amount_nanos"
          ],
          "properties": {
            "status": {
              "type": "string"
            },
            "currency": {
              "type": [
                "string",
                "null"
              ]
            },
            "amount_nanos": {
              "type": [
                "string",
                "null"
              ]
            }
          }
        },
        "timing": {
          "type": [
            "object",
            "null"
          ]
        },
        "finish_reasons": {
          "type": [
            "array",
            "null"
          ]
        },
        "failure": {
          "type": [
            "object",
            "null"
          ]
        },
        "output_guardrail_outcome": {
          "type": [
            "string",
            "null"
          ]
        }
      }
    }
  }
}
```

### HTTP 401

Missing, revoked, expired or invalid key.

### HTTP 404

Generation not found in workspace.

## Behavior and supported scope

Returns token breakdown, latency/timing observations, execution status, and customer-facing charge for a generation attempt in the authenticated key's workspace. Never exposes Provider purchase costs, platform margins, or internal correlation UUIDs.

**Supported scope:** implemented
