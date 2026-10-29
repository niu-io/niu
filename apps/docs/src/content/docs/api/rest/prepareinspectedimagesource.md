---
title: "Inspect and temporarily retain one exact inline image"
description: "POST /v1/media/image-sources"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/media/image-sources`

Active workspace inference key required. Every required image detector must have current workspace processing consent. Detector approval is obtained server-side; client verdicts, hashes and remote URLs are rejected. Saves encrypted approved bytes, never publishes a fetch token or dispatches an asset. Four preparations may run concurrently. Retention is 1 to 900 seconds, with separate workspace and installation storage ceilings. Maximum JSON body is 12 MiB plus 1024 bytes. No request-payload logging on this endpoint. The source ID is an internal API reference, not a display label. Missing inspection prerequisites fail before detector disclosure.

Operation: `prepareInspectedImageSource`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/media/image-sources" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/media/image-sources" \
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
    "image",
    "valid_for_seconds"
  ],
  "properties": {
    "image": {
      "type": "string",
      "maxLength": 12582912,
      "description": "Inline PNG, JPEG or WebP base64 data URL subject to configured detector decode limits."
    },
    "valid_for_seconds": {
      "type": "integer",
      "minimum": 1,
      "maximum": 900
    }
  }
}
```

## Responses

### HTTP 201

Approved encrypted source retained; no image bytes or fetch capability returned

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
        "source_id",
        "retained",
        "retention_seconds"
      ],
      "properties": {
        "source_id": {
          "type": "string",
          "format": "uuid"
        },
        "retained": {
          "const": true
        },
        "retention_seconds": {
          "type": "integer",
          "minimum": 1,
          "maximum": 900
        }
      }
    }
  }
}
```

### HTTP 400

Invalid or unsupported input, including a JSON body exceeding the endpoint limit

### HTTP 401

Active inference key required

### HTTP 403

Current inspection consent or detector approval unavailable. Missing authorized inspection prerequisites use error.type image_inspection_required; other policy refusals retain their existing error type.

### HTTP 409

Workspace policy changed during preparation

### HTTP 503

Encryption, preparation capacity, storage capacity or durable storage unavailable

## Behavior and supported scope

Active workspace inference key required. Every required image detector must have current workspace processing consent. Detector approval is obtained server-side; client verdicts, hashes and remote URLs are rejected. Saves encrypted approved bytes, never publishes a fetch token or dispatches an asset. Four preparations may run concurrently. Retention is 1 to 900 seconds, with separate workspace and installation storage ceilings. Maximum JSON body is 12 MiB plus 1024 bytes. No request-payload logging on this endpoint. The source ID is an internal API reference, not a display label. Missing inspection prerequisites fail before detector disclosure.

**Supported scope:** implemented
