---
title: "Rename a Provider asset"
description: "PATCH /v1/media/assets/{id}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`PATCH /v1/media/assets/{id}`

Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Claims one durable operation before one upstream mutation. After-send errors retain unknown and never authorize automatic replay; accepted operation does not imply Provider processing readiness.

Operation: `rename_assetProviderAsset`.

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
curl --fail-with-body -X PATCH "$NIU_ORIGIN/v1/media/assets/{id}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X PATCH "$NIU_ORIGIN/v1/media/assets/{id}" \
  -H "X-Niu-API-Key: $NIU_API_KEY" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

### Idempotency-Key

Location: **header**. Optional. Canonical nonnil UUID. Same key and unchanged input returns the saved operation without replaying its mutation.

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
    "model",
    "name"
  ],
  "properties": {
    "model": {
      "type": "string"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 64
    },
    "expected_revision": {
      "type": "string",
      "pattern": "^[1-9][0-9]*$"
    }
  }
}
```

## Responses

### HTTP 202

Saved operation accepted

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data",
    "group",
    "asset"
  ],
  "properties": {
    "data": {
      "type": "object",
      "required": [
        "id",
        "group_id",
        "model",
        "action",
        "status",
        "created_at_ms",
        "updated_at_ms"
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
        "asset_id": {
          "type": [
            "string",
            "null"
          ],
          "format": "uuid"
        },
        "model": {
          "type": "string"
        },
        "action": {
          "type": "string",
          "enum": [
            "create_group",
            "update_group",
            "delete_group",
            "create_asset",
            "rename_asset",
            "delete_asset"
          ]
        },
        "status": {
          "type": "string",
          "enum": [
            "prepared",
            "unknown",
            "acknowledged",
            "not_sent"
          ]
        },
        "http_status": {
          "type": [
            "integer",
            "null"
          ]
        },
        "request_id": {
          "type": [
            "string",
            "null"
          ]
        },
        "diagnostic": {
          "description": "Sanitized observed failure category and phase. Null for older records or when no diagnostic was saved. Does not establish nonexecution or authorize replay.",
          "type": [
            "object",
            "null"
          ],
          "additionalProperties": false,
          "required": [
            "category",
            "phase"
          ],
          "properties": {
            "category": {
              "type": "string",
              "enum": [
                "transport",
                "timeout",
                "response_too_large",
                "invalid_response",
                "upstream_rejected"
              ]
            },
            "phase": {
              "type": "string",
              "enum": [
                "exchange",
                "response",
                "acknowledgement"
              ]
            }
          }
        },
        "created_at_ms": {
          "type": "integer",
          "format": "int64"
        },
        "updated_at_ms": {
          "type": "integer",
          "format": "int64"
        }
      }
    },
    "group": {
      "anyOf": [
        {
          "type": "object",
          "required": [
            "id",
            "model",
            "name",
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
            "model": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "description": {
              "type": [
                "string",
                "null"
              ]
            },
            "kind": {
              "type": "string",
              "enum": [
                "generated",
                "person"
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
                    "observed_at_ms",
                    "description"
                  ],
                  "properties": {
                    "source": {
                      "type": "string",
                      "const": "provider_get"
                    },
                    "status": {
                      "type": "string",
                      "const": "present"
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
                    },
                    "description": {
                      "type": [
                        "string",
                        "null"
                      ],
                      "maxLength": 300
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
        },
        {
          "type": "null"
        }
      ]
    },
    "asset": {
      "anyOf": [
        {
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
        },
        {
          "type": "null"
        }
      ]
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

Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Claims one durable operation before one upstream mutation. After-send errors retain unknown and never authorize automatic replay; accepted operation does not imply Provider processing readiness.

**Supported scope:** implemented
