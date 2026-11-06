---
title: "Create one validated structured decision"
description: "POST /v1/decisions"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/decisions`

Explicit System 1 decision capability. Requires a concrete, workspace-visible Chat model granted to the calling key and explicitly declared structured-output support; workspace pools, Auto policies and codex aliases are rejected so routing cannot silently substitute a generated response for a decision. The caller supplies a bounded input and a closed, flat output schema of 1-16 string, boolean, integer or number properties. Exactly {"abstain":true} is an explicit abstention and is returned as a null decision; any other document must satisfy the schema exactly. Invalid, missing, timed-out or over-bound output is rejected with x-niu-decision-outcome/x-niu-decision-failure evidence and never falls back to another response type. The model is called once, without transport retry, through ordinary inference admission; key grants, workspace spending caps, billing, guardrails, rate/concurrency limits and cancellation still apply. Niu builds a bounded prompt from schema metadata and caller input only; it does not include Provider aliases, credentials, procurement prices, installation margins or other internal prompts, and it disables ordinary Logs payload capture for the nested call. The response may omit a decision when the model abstains; inspect evidence and the x-niu-attempt-id generation record for usage and authoritative customer charges. This is not calibrated probability evidence, task-quality evidence, a streaming API, idempotency or a guarantee of live model behavior.

Operation: `createDecision`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/decisions" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/decisions" \
  -H "X-Niu-API-Key: $NIU_API_KEY" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

No path, query, or header parameters are declared.

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "model",
    "input",
    "output_schema"
  ],
  "properties": {
    "model": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200,
      "description": "One concrete workspace Chat model alias. pool/ and codex/ aliases are rejected."
    },
    "input": {
      "oneOf": [
        {
          "type": "string",
          "description": "UTF-8 text; at most 16 KiB serialized."
        },
        {
          "type": "object",
          "description": "Arbitrary JSON object; at most 16 KiB serialized."
        }
      ]
    },
    "output_schema": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "properties",
        "required",
        "additionalProperties"
      ],
      "properties": {
        "type": {
          "type": "string",
          "const": "object"
        },
        "properties": {
          "type": "object",
          "minProperties": 1,
          "maxProperties": 16,
          "additionalProperties": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "type": "string",
                "enum": [
                  "string",
                  "boolean",
                  "integer",
                  "number"
                ]
              },
              "description": {
                "type": "string",
                "maxLength": 200
              },
              "enum": {
                "type": "array",
                "minItems": 1,
                "maxItems": 32,
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 64
                }
              },
              "minimum": {
                "type": "number"
              },
              "maximum": {
                "type": "number"
              }
            }
          }
        },
        "required": {
          "type": "array",
          "minItems": 1,
          "maxItems": 16,
          "items": {
            "type": "string"
          }
        },
        "additionalProperties": {
          "type": "boolean",
          "const": false
        }
      }
    },
    "timeout_ms": {
      "type": "integer",
      "minimum": 50,
      "maximum": 5000,
      "default": 2000
    },
    "max_output_tokens": {
      "type": "integer",
      "minimum": 1,
      "maximum": 1024,
      "default": 128
    }
  }
}
```

## Responses

### HTTP 200

The model returned a schema-valid decision, or an explicit abstention. A null decision is an abstention, never a missing decision promoted to a label.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "decision",
    "evidence"
  ],
  "properties": {
    "decision": {
      "type": [
        "object",
        "null"
      ],
      "description": "Validated decision object, or null for an explicit abstention."
    },
    "evidence": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "outcome",
        "model",
        "calls",
        "latency_ms",
        "tokens_estimated",
        "timeout_ms",
        "max_output_tokens"
      ],
      "properties": {
        "outcome": {
          "type": "string",
          "enum": [
            "decided",
            "abstained"
          ]
        },
        "model": {
          "type": "string"
        },
        "calls": {
          "type": "integer",
          "const": 1
        },
        "input_tokens": {
          "type": [
            "integer",
            "null"
          ]
        },
        "output_tokens": {
          "type": [
            "integer",
            "null"
          ]
        },
        "tokens_estimated": {
          "type": "boolean"
        },
        "latency_ms": {
          "type": "integer",
          "minimum": 0
        },
        "timeout_ms": {
          "type": "integer"
        },
        "max_output_tokens": {
          "type": "integer"
        }
      }
    }
  }
}
```

### HTTP 400

Malformed or unbounded request, pool/Auto alias, unsupported input shape, or invalid closed output_schema.

### HTTP 401

Missing, expired or revoked credential

### HTTP 403

The key is not authorized to invoke models or the request is denied by policy

### HTTP 404

The model is not visible to the workspace or not granted to the key

### HTTP 501

The model does not declare the Chat and structured-output capabilities required for decisions

### HTTP 502

Malformed, missing or over-bound model output; the call may have incurred customer charges

### HTTP 504

The decision call exceeded timeout_ms; the call may have incurred charges or remain unresolved

## Behavior and supported scope

Explicit System 1 decision capability. Requires a concrete, workspace-visible Chat model granted to the calling key and explicitly declared structured-output support; workspace pools, Auto policies and codex aliases are rejected so routing cannot silently substitute a generated response for a decision. The caller supplies a bounded input and a closed, flat output schema of 1-16 string, boolean, integer or number properties. Exactly {"abstain":true} is an explicit abstention and is returned as a null decision; any other document must satisfy the schema exactly. Invalid, missing, timed-out or over-bound output is rejected with x-niu-decision-outcome/x-niu-decision-failure evidence and never falls back to another response type. The model is called once, without transport retry, through ordinary inference admission; key grants, workspace spending caps, billing, guardrails, rate/concurrency limits and cancellation still apply. Niu builds a bounded prompt from schema metadata and caller input only; it does not include Provider aliases, credentials, procurement prices, installation margins or other internal prompts, and it disables ordinary Logs payload capture for the nested call. The response may omit a decision when the model abstains; inspect evidence and the x-niu-attempt-id generation record for usage and authoritative customer charges. This is not calibrated probability evidence, task-quality evidence, a streaming API, idempotency or a guarantee of live model behavior.

**Supported scope:** implemented
