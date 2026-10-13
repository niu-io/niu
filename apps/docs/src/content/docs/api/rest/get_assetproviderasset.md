---
title: "Read a saved Provider asset"
description: "GET /v1/media/assets/{id}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/media/assets/{id}`

Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Supplier or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Reads locally saved metadata only; unknown operation states require explicit reconciliation.

Operation: `get_assetProviderAsset`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/media/assets/{id}" \
  -H "Authorization: Bearer $NIU_API_KEY"
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

Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Supplier or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Reads locally saved metadata only; unknown operation states require explicit reconciliation.

**Supported scope:** implemented
