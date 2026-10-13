---
title: "Create OpenAI-compatible text embeddings"
description: "POST /v1/embeddings"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/embeddings`

The configured route must use an OpenAI-compatible protocol and explicitly declare embedding support. Optional dimensions and base64 output require separate route capabilities. These declarations are operator assertions, not provider conformance evidence. Unsupported providers or capabilities are rejected before durable operation and attempt creation. Workspace model grants, IP policy, rate/concurrency/token limits and configured customer billing apply before dispatch.

Operation: `createEmbedding`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/embeddings" \
  -H "Authorization: Bearer $NIU_API_KEY" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### x-niu-log-payloads

Location: **header**. Optional. Request and sanitized customer response content is retained until 24 hours after the original request creation time by default. Send false (case-insensitive) to disable capture for this request; true or an omitted header retains content. Invalid values or repeated headers are rejected before inference. Requests exceeding the 1 MB capture limit are rejected; response capture is truncated at 1 MB. Does not backfill earlier requests.

```json
{
  "type": "string",
  "enum": [
    "true",
    "false"
  ],
  "default": "true"
}
```

### X-Niu-Task-ID

Location: **header**. Optional. Optional opaque task correlation key. Requests with the same value can be grouped in workspace activity. Niu stores the value as metadata and does not forward it to the provider.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 200,
  "pattern": "^[!-~]{1,200}$"
}
```

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "model",
    "input"
  ],
  "properties": {
    "model": {
      "type": "string",
      "minLength": 1
    },
    "input": {
      "oneOf": [
        {
          "type": "string",
          "minLength": 1
        },
        {
          "type": "array",
          "minItems": 1,
          "maxItems": 2048,
          "items": {
            "type": "string",
            "minLength": 1
          }
        }
      ]
    },
    "encoding_format": {
      "type": "string",
      "enum": [
        "float",
        "base64"
      ],
      "default": "float"
    },
    "dimensions": {
      "type": "integer",
      "minimum": 1,
      "maximum": 65536
    },
    "user": {
      "type": "string",
      "maxLength": 512
    }
  }
}
```

## Responses

### HTTP 200

One validated embedding per input item; the configured upstream model is replaced with the public model alias.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "object",
    "data",
    "model"
  ],
  "properties": {
    "object": {
      "type": "string",
      "const": "list"
    },
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "embedding"
        ],
        "properties": {
          "object": {
            "type": "string",
            "const": "embedding"
          },
          "index": {
            "type": "integer",
            "minimum": 0
          },
          "embedding": {
            "oneOf": [
              {
                "type": "array",
                "items": {
                  "type": "number"
                }
              },
              {
                "type": "string"
              }
            ]
          }
        },
        "additionalProperties": true
      }
    },
    "model": {
      "type": "string"
    },
    "usage": {
      "type": "object",
      "properties": {
        "prompt_tokens": {
          "type": "integer",
          "minimum": 0
        },
        "total_tokens": {
          "type": "integer",
          "minimum": 0
        }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": true
}
```

### HTTP 400

Invalid body, unsupported field, or invalid input shape.

### HTTP 401

Missing or invalid gateway credentials.

### HTTP 402

Insufficient balance or configured spending limit exceeded.

### HTTP 403

Source IP or enforced policy denies the request. Recorded preparation-policy refusals use error.type guardrail_denied before model dispatch; do not classify every 403 as a Guardrail refusal.

### HTTP 404

Model alias does not exist or is unavailable to this key.

### HTTP 409

Admission conflict before dispatch. Type route_configuration_changed identifies a changed managed credential/model configuration; that request was not sent upstream. Other conflicts retain their own error type.

### HTTP 413

Request body exceeds 1 MiB; rejected before inference whether payload capture is enabled or disabled. Framework responses may use a plain-text body.

### HTTP 422

Invalid JSON or unsupported token admission/pricing requirements. Embeddings does not report cache-read, cache-write or reasoning subsets. Separate rates for unavailable categories in a bound base or reachable tier schedule return unsupported_token_pricing before dispatch or reservation commits.

### HTTP 429

API key request, concurrency or token rate limit exceeded.

### HTTP 501

The model route lacks the required embedding, configurable-dimension or base64 capability, or uses an unsupported protocol. The unsupported_operation_error message identifies the limitation and request alternative before admission.

### HTTP 502

Provider request failed or returned an invalid embedding response.

### HTTP 503

Durable storage or configured route unavailable.

## Behavior and supported scope

The configured route must use an OpenAI-compatible protocol and explicitly declare embedding support. Optional dimensions and base64 output require separate route capabilities. These declarations are operator assertions, not provider conformance evidence. Unsupported providers or capabilities are rejected before durable operation and attempt creation. Workspace model grants, IP policy, rate/concurrency/token limits and configured customer billing apply before dispatch.

**Supported scope:** implemented

**Supported scope:** OpenAI-compatible text inputs and float/base64 response vectors; no token-ID arrays, multimodal inputs, or streaming.
