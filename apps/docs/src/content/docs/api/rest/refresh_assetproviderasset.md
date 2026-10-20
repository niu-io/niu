---
title: "Refresh one owned Provider asset"
description: "POST /v1/media/assets/{id}/refresh"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/media/assets/{id}/refresh`

Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Performs one explicit read of the original owned Provider reference and saves validated metadata. This is not a generation or mutation retry. Successful identity-validated reads persist nullable observation metadata even while the resource status and original uncertain operation remain unknown. Unknown writes remain blocked; this read does not redispatch, infer write completion, acknowledge a delete from 404, discover an unknown creation ID or grant material reuse. Failed reads preserve the previous observation and its timestamp.

Operation: `refresh_assetProviderAsset`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/media/assets/{id}/refresh" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  --url-query 'model=<MODEL>'
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/media/assets/{id}/refresh" \
  -H "X-Niu-API-Key: $NIU_API_KEY" \
  --url-query 'model=<MODEL>'
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

### model

Location: **query**. **Required.**

```json
{
  "type": "string"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Owned metadata

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
        "group_id",
        "model",
        "kind",
        "status",
        "revision",
        "created_at_ms",
        "updated_at_ms",
        "observation"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "group_id": {
          "type": "string",
          "format": "uuid"
        },
        "model": {
          "type": "string"
        },
        "name": {
          "type": [
            "string",
            "null"
          ]
        },
        "kind": {
          "type": "string",
          "enum": [
            "image",
            "audio",
            "video"
          ]
        },
        "status": {
          "type": "string"
        },
        "revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        },
        "created_at_ms": {
          "type": "integer",
          "format": "int64"
        },
        "updated_at_ms": {
          "type": "integer",
          "format": "int64"
        },
        "observation": {
          "oneOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "source",
                "status",
                "name",
                "observed_at_ms"
              ],
              "properties": {
                "source": {
                  "type": "string",
                  "const": "provider_get"
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "processing",
                    "active",
                    "failed"
                  ]
                },
                "name": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "maxLength": 64
                },
                "observed_at_ms": {
                  "type": "integer",
                  "format": "int64",
                  "description": "Server time of the saved successful Provider read. Historical observation, not a current availability guarantee."
                }
              }
            },
            {
              "type": "null"
            }
          ],
          "description": "Last successful identity-validated Provider Get metadata, independent of mutation status. Null before any successful read. An observation never acknowledges or unblocks unknown writes, grants dispatch or proves an uncertain write completed."
        }
      }
    }
  }
}
```

### HTTP 400

Malformed or unsupported request fields

### HTTP 401

Missing, expired or revoked API key

### HTTP 403

Workspace or key policy refuses access

### HTTP 404

Owned object or model unavailable

### HTTP 409

Changed input, stale revision, unresolved identity or route conflict

### HTTP 413

Request exceeds its bounded size

### HTTP 501

Selected channel does not support asset management

### HTTP 502

Provider read failed safely

### HTTP 503

Credential, capacity or bounded storage unavailable

## Behavior and supported scope

Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Performs one explicit read of the original owned Provider reference and saves validated metadata. This is not a generation or mutation retry. Successful identity-validated reads persist nullable observation metadata even while the resource status and original uncertain operation remain unknown. Unknown writes remain blocked; this read does not redispatch, infer write completion, acknowledge a delete from 404, discover an unknown creation ID or grant material reuse. Failed reads preserve the previous observation and its timestamp.

**Supported scope:** implemented
