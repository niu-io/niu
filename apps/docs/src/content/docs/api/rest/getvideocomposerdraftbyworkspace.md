---
title: "Read a mutable personal Video composer"
description: "GET /api/v1/workspaces/{workspace}/video/draft"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/workspaces/{workspace}/video/draft`

One mutable actor-private Video composer per workspace. Operators are isolated; installation credentials share the installation actor. Read requires workspace Read permission. Absent state returns null payload and revision zero. Retention is 30 days after the last confirmed edit; expired content is hidden immediately and background maintenance erases it. Reads expose the expiry tombstone revision before maintenance. Saved key/model/reference identities are context only, including unavailable historical resources; they confer no current access or readiness. No inference, Provider calls, reservation, media reads or inspection occur. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

Operation: `getVideoComposerDraftByWorkspace`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/workspaces/{workspace}/video/draft" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### workspace

Location: **path**. **Required.**

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

Actor-private composer state.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "payload",
        "revision",
        "expires_at_ms",
        "content_state"
      ],
      "properties": {
        "payload": {
          "oneOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "prompt",
                "controls",
                "references"
              ],
              "properties": {
                "keyId": {
                  "oneOf": [
                    {
                      "type": "string",
                      "format": "uuid",
                      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "sessionId": {
                  "oneOf": [
                    {
                      "type": "string",
                      "format": "uuid",
                      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "model": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "minLength": 1,
                  "maxLength": 512
                },
                "prompt": {
                  "type": "string",
                  "maxLength": 12000
                },
                "controls": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [],
                  "properties": {
                    "duration": {
                      "oneOf": [
                        {
                          "type": "integer",
                          "minimum": -9007199254740991,
                          "maximum": 9007199254740991
                        },
                        {
                          "type": "string",
                          "maxLength": 256
                        }
                      ]
                    },
                    "seed": {
                      "oneOf": [
                        {
                          "type": "integer",
                          "minimum": -9007199254740991,
                          "maximum": 9007199254740991
                        },
                        {
                          "type": "string",
                          "maxLength": 256
                        }
                      ]
                    },
                    "frames_per_second": {
                      "oneOf": [
                        {
                          "type": "integer",
                          "minimum": -9007199254740991,
                          "maximum": 9007199254740991
                        },
                        {
                          "type": "string",
                          "maxLength": 256
                        }
                      ]
                    },
                    "resolution": {
                      "type": "string",
                      "maxLength": 256
                    },
                    "ratio": {
                      "type": "string",
                      "maxLength": 256
                    },
                    "omni_reference_task_type": {
                      "type": "string",
                      "maxLength": 256
                    },
                    "watermark": {
                      "type": "boolean"
                    },
                    "camera_fixed": {
                      "type": "boolean"
                    },
                    "return_last_frame": {
                      "type": "boolean"
                    }
                  }
                },
                "references": {
                  "type": "array",
                  "maxItems": 32,
                  "items": {
                    "oneOf": [
                      {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                          "type",
                          "provider_asset"
                        ],
                        "properties": {
                          "type": {
                            "const": "provider_asset"
                          },
                          "provider_asset": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": [
                              "id"
                            ],
                            "properties": {
                              "id": {
                                "type": "string",
                                "format": "uuid",
                                "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
                              }
                            }
                          },
                          "role": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 256,
                            "description": "Optional nonempty role matching the existing VideoIntent reference grammar; explicit null is rejected."
                          }
                        }
                      },
                      {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                          "type",
                          "workspace_asset"
                        ],
                        "properties": {
                          "type": {
                            "const": "workspace_asset"
                          },
                          "workspace_asset": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": [
                              "asset_id",
                              "consent_to_process"
                            ],
                            "properties": {
                              "asset_id": {
                                "type": "string",
                                "format": "uuid",
                                "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
                              },
                              "consent_to_process": {
                                "const": true
                              }
                            }
                          },
                          "role": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 256,
                            "description": "Optional nonempty role matching the existing VideoIntent reference grammar; explicit null is rejected."
                          }
                        }
                      }
                    ]
                  }
                }
              }
            },
            {
              "type": "null"
            }
          ]
        },
        "revision": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991
        },
        "expires_at_ms": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[0-9]+$"
        },
        "content_state": {
          "type": "string",
          "enum": [
            "empty",
            "retained",
            "expired"
          ]
        }
      }
    }
  }
}
```

### HTTP 401

Missing or invalid administration/member authentication.

### HTTP 403

Insufficient workspace permission or scope.

### HTTP 404

Resource missing or outside authorized workspace/owner scope.

### HTTP 500

Internal storage failure.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

One mutable actor-private Video composer per workspace. Operators are isolated; installation credentials share the installation actor. Read requires workspace Read permission. Absent state returns null payload and revision zero. Retention is 30 days after the last confirmed edit; expired content is hidden immediately and background maintenance erases it. Reads expose the expiry tombstone revision before maintenance. Saved key/model/reference identities are context only, including unavailable historical resources; they confer no current access or readiness. No inference, Provider calls, reservation, media reads or inspection occur. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

**Supported scope:** implemented
