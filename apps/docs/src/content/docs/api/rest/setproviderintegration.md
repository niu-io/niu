---
title: "Set provider integration identity"
description: "PUT /api/v1/providers/{provider}/integration"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/providers/{provider}/integration`

Platform administration required. Integration identity is independent of the inference adapter, endpoint, credential and prices. An unspecified default resolves to custom without claiming detection. A connection can override its Provider default; null restores inheritance. Writes require the current local revision (zero before the first save) and never overwrite a concurrent edit. This operation does not discover models, grant upstream management rights, publish rates or dispatch inference.

Operation: `setProviderIntegration`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/providers/{provider}/integration" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "integration_type",
    "expected_revision"
  ],
  "properties": {
    "integration_type": {
      "type": "string",
      "enum": [
        "openrouter",
        "newapi",
        "litellm",
        "custom"
      ]
    },
    "expected_revision": {
      "type": "integer",
      "format": "int64",
      "minimum": 0
    }
  }
}
```

## Responses

### HTTP 200

Current integration selection and effective source

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
        "integration_type",
        "effective_type",
        "source",
        "revision"
      ],
      "properties": {
        "integration_type": {
          "type": [
            "string",
            "null"
          ],
          "enum": [
            "openrouter",
            "newapi",
            "litellm",
            "custom",
            null
          ]
        },
        "effective_type": {
          "type": "string",
          "enum": [
            "openrouter",
            "newapi",
            "litellm",
            "custom"
          ]
        },
        "source": {
          "type": "string",
          "enum": [
            "connection",
            "provider",
            "unspecified"
          ]
        },
        "revision": {
          "type": "integer",
          "format": "int64",
          "minimum": 0
        }
      }
    }
  }
}
```

### HTTP 400

Invalid integration or revision

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 404

Resource not found

### HTTP 409

Configuration changed concurrently

### HTTP 503

Storage unavailable

## Behavior and supported scope

Platform administration required. Integration identity is independent of the inference adapter, endpoint, credential and prices. An unspecified default resolves to custom without claiming detection. A connection can override its Provider default; null restores inheritance. Writes require the current local revision (zero before the first save) and never overwrite a concurrent edit. This operation does not discover models, grant upstream management rights, publish rates or dispatch inference.

**Supported scope:** implemented
