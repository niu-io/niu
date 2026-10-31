---
title: "Read a current or historical evaluation definition"
description: "GET /v1/evaluations/{slug}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/evaluations/{slug}`

Requires a current workspace API key with explicitly delegated evaluations:read. No-store response. Judgments are submitter-reported, not platform guarantees. Inference is separately authorized and charged.

Operation: `getEvaluation`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/evaluations/{slug}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/evaluations/{slug}" \
  -H "X-Niu-API-Key: $NIU_API_KEY"
```

## Parameters

### slug

Location: **path**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
  "maxLength": 80
}
```

### revision

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 9007199254740991
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Scoped evidence

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "slug": {
      "type": "string",
      "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
      "maxLength": 80
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "task": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4000
    },
    "rubric": {
      "type": "string",
      "minLength": 1,
      "maxLength": 8000
    },
    "protocol": {
      "type": "string",
      "enum": [
        "chat",
        "responses",
        "messages",
        "embeddings",
        "generate_content"
      ]
    },
    "revision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740990
    },
    "samples": {
      "type": "array",
      "minItems": 1,
      "maxItems": 64,
      "items": {
        "type": "object",
        "properties": {
          "reference": {
            "type": "string",
            "minLength": 1,
            "maxLength": 100,
            "pattern": "^[A-Za-z0-9_.-]+$"
          },
          "request_sha256": {
            "type": "string",
            "pattern": "^[0-9a-f]{64}$"
          }
        },
        "required": [
          "reference",
          "request_sha256"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "slug",
    "name",
    "task",
    "rubric",
    "protocol",
    "revision",
    "samples"
  ],
  "additionalProperties": false
}
```

### HTTP 400

Invalid input or mismatched evaluation binding

### HTTP 401

Invalid, expired or revoked key

### HTTP 403

Current delegated capability required

### HTTP 404

Scoped definition or run not found

### HTTP 409

Revision or immutable submission conflict

## Behavior and supported scope

Requires a current workspace API key with explicitly delegated evaluations:read. No-store response. Judgments are submitter-reported, not platform guarantees. Inference is separately authorized and charged.

**Supported scope:** implemented
