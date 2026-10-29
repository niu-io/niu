---
title: "Dry-run routing preview for a model route pool"
description: "POST /api/v1/pools/{reference}/preview"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/pools/{reference}/preview`

Evaluates a pool's ordered routing rules, candidate eligibility, priority tiers, and normalized traffic weights for a simulated request without dispatching upstream traffic.

Operation: `previewPool`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/pools/{reference}/preview" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### reference

Location: **path**. **Required.** Unpadded base64url encoding of the exact ASCII pool alias.

```json
{
  "type": "string",
  "minLength": 2,
  "maxLength": 267,
  "pattern": "^[A-Za-z0-9_-]+$"
}
```

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "protocol": {
      "type": "string",
      "enum": [
        "chat",
        "responses",
        "messages"
      ]
    },
    "streaming": {
      "type": "boolean"
    },
    "vision": {
      "type": "boolean"
    },
    "tools": {
      "type": "boolean"
    },
    "structured_output": {
      "type": "boolean"
    },
    "reasoning": {
      "type": "boolean"
    },
    "input_tokens": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": 1
    },
    "output_tokens": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": 1
    },
    "candidates": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "rules": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "default_action": {
      "type": "string",
      "enum": [
        "candidates",
        "reject"
      ]
    }
  }
}
```

## Responses

### HTTP 200

Dry-run routing preview result

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object"
    }
  }
}
```

### HTTP 400

Invalid reference or preview parameters

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 404

Pool not found

## Behavior and supported scope

Evaluates a pool's ordered routing rules, candidate eligibility, priority tiers, and normalized traffic weights for a simulated request without dispatching upstream traffic.

**Supported scope:** implemented
