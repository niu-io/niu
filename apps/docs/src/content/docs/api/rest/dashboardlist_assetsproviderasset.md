---
title: "List saved workspace Provider assets"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/media/assets"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/media/assets`

Session-authenticated workspace bridge. GET requires Read; mutations require Write. The selected workspace key, model grants, exact account/channel binding and member authorization are independently enforced; credentials remain server-side. Requires current selected workspace key authority, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Supplier or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Lists only locally saved owned rows; it never performs a global Provider list request.

Operation: `dashboardlist_assetsProviderAsset`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/media/assets" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

### organization

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### project

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### key

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

### after

Location: **query**. Optional.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 50
}
```

### group_id

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

Owned metadata

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data",
    "next_cursor"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
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
    },
    "next_cursor": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
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

Session-authenticated workspace bridge. GET requires Read; mutations require Write. The selected workspace key, model grants, exact account/channel binding and member authorization are independently enforced; credentials remain server-side. Requires current selected workspace key authority, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Supplier or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Lists only locally saved owned rows; it never performs a global Provider list request.

**Supported scope:** implemented
