---
title: "Explicitly dispatch an existing native material preparation"
description: "POST /v1/media/operations/{id}/dispatch"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/media/operations/{id}/dispatch`

Current selected key, exact model/account/channel and workspace Write authority required. Safe Niu references only; no Provider identifiers, source URLs, credentials or procurement prices returned. Requires an already saved operation matching the original idempotency UUID and full canonical input. Never creates a missing preparation. Atomic prepared-to-unknown claim precedes a single Provider call; unknown and terminal records never redispatch. No automatic retries.

Operation: `dispatchProviderAssetOperation`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/media/operations/{id}/dispatch" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Idempotency-Key: <IDEMPOTENCY_KEY>' \
  -H 'Content-Type: application/json' \
  --data @request.json
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/media/operations/{id}/dispatch" \
  -H "X-Niu-API-Key: $NIU_API_KEY" \
  -H 'Idempotency-Key: <IDEMPOTENCY_KEY>' \
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

Location: **header**. **Required.** Original canonical nonnil request UUID.

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
  "oneOf": [
    {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "action",
        "model",
        "name"
      ],
      "properties": {
        "action": {
          "type": "string",
          "const": "create_group"
        },
        "model": {
          "type": "string"
        },
        "name": {
          "type": "string"
        },
        "description": {
          "type": "string"
        }
      }
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "action",
        "model",
        "group_id"
      ],
      "properties": {
        "action": {
          "type": "string",
          "const": "update_group"
        },
        "model": {
          "type": "string"
        },
        "group_id": {
          "type": "string",
          "format": "uuid"
        },
        "name": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "expected_revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        }
      }
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "action",
        "model",
        "group_id"
      ],
      "properties": {
        "action": {
          "type": "string",
          "const": "delete_group"
        },
        "model": {
          "type": "string"
        },
        "group_id": {
          "type": "string",
          "format": "uuid"
        },
        "expected_revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        }
      }
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "action",
        "model",
        "group_id",
        "url",
        "kind"
      ],
      "properties": {
        "action": {
          "type": "string",
          "const": "create_asset"
        },
        "model": {
          "type": "string"
        },
        "group_id": {
          "type": "string",
          "format": "uuid"
        },
        "url": {
          "type": "string",
          "format": "uri",
          "writeOnly": true
        },
        "name": {
          "type": "string"
        },
        "kind": {
          "type": "string",
          "enum": [
            "image",
            "video",
            "audio"
          ]
        }
      }
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "action",
        "model",
        "asset_id",
        "name"
      ],
      "properties": {
        "action": {
          "type": "string",
          "const": "rename_asset"
        },
        "model": {
          "type": "string"
        },
        "asset_id": {
          "type": "string",
          "format": "uuid"
        },
        "name": {
          "type": "string"
        },
        "expected_revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        }
      }
    },
    {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "action",
        "model",
        "asset_id"
      ],
      "properties": {
        "action": {
          "type": "string",
          "const": "delete_asset"
        },
        "model": {
          "type": "string"
        },
        "asset_id": {
          "type": "string",
          "format": "uuid"
        },
        "expected_revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        }
      }
    }
  ]
}
```

## Responses

### HTTP 202

Saved operation metadata

Response headers:

```json
{
  "Cache-Control": {
    "schema": {
      "type": "string"
    },
    "description": "no-store"
  }
}
```

Content type: `application/json`.

```json
{
  "type": "object",
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

Invalid input or missing idempotency UUID

### HTTP 401

Missing expired or revoked key/session

### HTTP 403

Workspace Write or key policy refused

### HTTP 404

Owned preparation or model unavailable

### HTTP 409

Changed canonical input, stale revision, route or operation state conflict

### HTTP 413

Request exceeds16KiB

### HTTP 501

Channel unsupported

### HTTP 503

Storage or configuration unavailable

## Behavior and supported scope

Current selected key, exact model/account/channel and workspace Write authority required. Safe Niu references only; no Provider identifiers, source URLs, credentials or procurement prices returned. Requires an already saved operation matching the original idempotency UUID and full canonical input. Never creates a missing preparation. Atomic prepared-to-unknown claim precedes a single Provider call; unknown and terminal records never redispatch. No automatic retries.

**Supported scope:** implemented
