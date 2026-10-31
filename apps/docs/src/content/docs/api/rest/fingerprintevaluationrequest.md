---
title: "Fingerprint effective task input without inference"
description: "POST /v1/evaluations/fingerprint"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/evaluations/fingerprint`

Requires a current workspace API key with explicitly delegated evaluations:read. No-store response. Judgments are submitter-reported, not platform guarantees. Inference is separately authorized and charged. Version 1 removes only top-level model, stream, stream_options, metadata and user, recursively canonicalizes JSON, and hashes the protocol-bound request. The request body is not saved by this operation. It is not live qualification.

Operation: `fingerprintEvaluationRequest`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/evaluations/fingerprint" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/evaluations/fingerprint" \
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
  "properties": {
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
    "request": {
      "type": "object"
    }
  },
  "required": [
    "protocol",
    "request"
  ],
  "additionalProperties": false
}
```

## Responses

### HTTP 200

Scoped evidence

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "request_sha256": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "fingerprint_version": {
      "const": 1
    },
    "protocol": {
      "type": "string"
    },
    "inference_performed": {
      "const": false
    }
  },
  "required": [
    "request_sha256",
    "fingerprint_version",
    "protocol",
    "inference_performed"
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

Requires a current workspace API key with explicitly delegated evaluations:read. No-store response. Judgments are submitter-reported, not platform guarantees. Inference is separately authorized and charged. Version 1 removes only top-level model, stream, stream_options, metadata and user, recursively canonicalizes JSON, and hashes the protocol-bound request. The request body is not saved by this operation. It is not live qualification.

**Supported scope:** implemented
