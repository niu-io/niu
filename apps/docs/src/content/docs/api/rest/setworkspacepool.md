---
title: "Create or replace a workspace model policy"
description: "PUT /v1/pools/{slug}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /v1/pools/{slug}`

Requires a current workspace API key with delegated pools:write. Platform supply pools, procurement prices and credentials are never exposed. Use revision zero to create, otherwise the current expected revision. Conflicts require read/reconcile; no automatic replay. Candidate aliases must be allowed by the key and visible in the workspace. This operation does not invoke a model. Read back the saved revision. Restore a prior configuration using the current expected revision.

Operation: `setWorkspacePool`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/v1/pools/{slug}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X PUT "$NIU_ORIGIN/v1/pools/{slug}" \
  -H "X-Niu-API-Key: $NIU_API_KEY" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### slug

Location: **path**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
  "maxLength": 80
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
    "slug",
    "name",
    "description",
    "enabled",
    "revision",
    "candidates"
  ],
  "properties": {
    "slug": {
      "type": "string",
      "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
      "maxLength": 80
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "description": {
      "type": "string",
      "maxLength": 4000
    },
    "enabled": {
      "type": "boolean"
    },
    "revision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740990
    },
    "candidates": {
      "type": "array",
      "minItems": 1,
      "maxItems": 64,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "alias",
          "priority",
          "weight",
          "enabled"
        ],
        "properties": {
          "alias": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200
          },
          "priority": {
            "type": "integer",
            "minimum": -1000,
            "maximum": 1000
          },
          "weight": {
            "type": "integer",
            "minimum": 1,
            "maximum": 10000
          },
          "enabled": {
            "type": "boolean"
          }
        }
      }
    },
    "rules": {
      "type": "array",
      "maxItems": 32,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "name",
          "candidates"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "enabled": {
            "type": "boolean"
          },
          "conditions": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "protocol": {
                "type": "string",
                "enum": [
                  "chat",
                  "messages",
                  "responses"
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
              "min_input_tokens": {
                "type": "integer",
                "minimum": 0
              },
              "max_input_tokens": {
                "type": "integer",
                "minimum": 0
              },
              "min_output_tokens": {
                "type": "integer",
                "minimum": 0
              },
              "max_output_tokens": {
                "type": "integer",
                "minimum": 0
              }
            }
          },
          "candidates": {
            "type": "array",
            "minItems": 1,
            "maxItems": 64,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "alias",
                "priority",
                "weight",
                "enabled"
              ],
              "properties": {
                "alias": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 200
                },
                "priority": {
                  "type": "integer",
                  "minimum": -1000,
                  "maximum": 1000
                },
                "weight": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 10000
                },
                "enabled": {
                  "type": "boolean"
                }
              }
            }
          }
        }
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

Workspace-scoped result; no-store.

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "slug",
        "name",
        "description",
        "enabled",
        "revision",
        "candidates"
      ],
      "properties": {
        "slug": {
          "type": "string",
          "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
          "maxLength": 80
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "description": {
          "type": "string",
          "maxLength": 4000
        },
        "enabled": {
          "type": "boolean"
        },
        "revision": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740990
        },
        "candidates": {
          "type": "array",
          "minItems": 1,
          "maxItems": 64,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "alias",
              "priority",
              "weight",
              "enabled"
            ],
            "properties": {
              "alias": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "priority": {
                "type": "integer",
                "minimum": -1000,
                "maximum": 1000
              },
              "weight": {
                "type": "integer",
                "minimum": 1,
                "maximum": 10000
              },
              "enabled": {
                "type": "boolean"
              }
            }
          }
        },
        "rules": {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id",
              "name",
              "candidates"
            ],
            "properties": {
              "id": {
                "type": "string"
              },
              "name": {
                "type": "string"
              },
              "enabled": {
                "type": "boolean"
              },
              "conditions": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "protocol": {
                    "type": "string",
                    "enum": [
                      "chat",
                      "messages",
                      "responses"
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
                  "min_input_tokens": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "max_input_tokens": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "min_output_tokens": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "max_output_tokens": {
                    "type": "integer",
                    "minimum": 0
                  }
                }
              },
              "candidates": {
                "type": "array",
                "minItems": 1,
                "maxItems": 64,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "alias",
                    "priority",
                    "weight",
                    "enabled"
                  ],
                  "properties": {
                    "alias": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 200
                    },
                    "priority": {
                      "type": "integer",
                      "minimum": -1000,
                      "maximum": 1000
                    },
                    "weight": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 10000
                    },
                    "enabled": {
                      "type": "boolean"
                    }
                  }
                }
              }
            }
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
  }
}
```

### HTTP 400

Invalid configuration or cursor

### HTTP 401

Missing, expired or revoked credential

### HTTP 403

Required delegated capability is absent

### HTTP 404

Scoped pool not found

### HTTP 409

Expected revision conflict

## Behavior and supported scope

Requires a current workspace API key with delegated pools:write. Platform supply pools, procurement prices and credentials are never exposed. Use revision zero to create, otherwise the current expected revision. Conflicts require read/reconcile; no automatic replay. Candidate aliases must be allowed by the key and visible in the workspace. This operation does not invoke a model. Read back the saved revision. Restore a prior configuration using the current expected revision.

**Supported scope:** implemented
