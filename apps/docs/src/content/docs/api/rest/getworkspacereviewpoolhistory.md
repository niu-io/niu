---
title: "Review: Read immutable workspace policy revisions"
description: "GET /api/v1/workspaces/{workspace}/routing/{slug}/history"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/workspaces/{workspace}/routing/{slug}/history`

Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.

Operation: `getWorkspaceReviewPoolHistory`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/workspaces/{workspace}/routing/{slug}/history" \
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

### slug

Location: **path**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
  "maxLength": 80
}
```

### before

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Workspace-scoped result; no-store.

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "array",
      "items": {
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
    },
    "next_before": {
      "type": [
        "integer",
        "null"
      ]
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

Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.

**Supported scope:** implemented
