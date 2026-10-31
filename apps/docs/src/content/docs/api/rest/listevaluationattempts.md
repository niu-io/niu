---
title: "Discover admitted attempts for an evaluation sample"
description: "GET /v1/evaluations/{slug}/attempts"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/evaluations/{slug}/attempts`

Requires a current workspace API key with explicitly delegated evaluations:read. No-store response. Judgments are submitter-reported, not platform guarantees. Inference is separately authorized and charged. Snapshot pagination is lexical by attempt ID; restart pagination to discover newly admitted work. Absence does not prove that no execution occurred. Do not automatically replay paid inference after an uncertain response.

Operation: `listEvaluationAttempts`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/evaluations/{slug}/attempts" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  --url-query 'revision=<REVISION>' \
  --url-query 'sample=<SAMPLE>'
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/evaluations/{slug}/attempts" \
  -H "X-Niu-API-Key: $NIU_API_KEY" \
  --url-query 'revision=<REVISION>' \
  --url-query 'sample=<SAMPLE>'
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

Location: **query**. **Required.**

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 9007199254740991
}
```

### sample

Location: **query**. **Required.**

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 100,
  "pattern": "^[A-Za-z0-9_.-]+$"
}
```

### after

Location: **query**. Optional.

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

Scoped evidence

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "properties": {
          "attempt_id": {
            "type": "string"
          },
          "operation_id": {
            "type": "string"
          },
          "bound_at": {
            "type": "string"
          },
          "request_sha256": {
            "type": "string"
          },
          "execution": {
            "type": "string"
          },
          "completed_at": {
            "type": [
              "string",
              "null"
            ]
          }
        },
        "required": [
          "attempt_id",
          "operation_id",
          "bound_at",
          "request_sha256",
          "execution",
          "completed_at"
        ]
      }
    },
    "next_after": {
      "type": [
        "string",
        "null"
      ]
    },
    "discovery_semantics": {
      "type": "string"
    }
  },
  "required": [
    "data",
    "next_after",
    "discovery_semantics"
  ]
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

Requires a current workspace API key with explicitly delegated evaluations:read. No-store response. Judgments are submitter-reported, not platform guarantees. Inference is separately authorized and charged. Snapshot pagination is lexical by attempt ID; restart pagination to discover newly admitted work. Absence does not prove that no execution occurred. Do not automatically replay paid inference after an uncertain response.

**Supported scope:** implemented
