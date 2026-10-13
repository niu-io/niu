---
title: "Export one owned saved conversation"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}/export"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}/export`

Requires workspace read access and the authenticated conversation owner. Reads durable content directly, including sessions outside the latest-100 list. Excludes internal identifiers, settings, diagnostic errors and accounting. Conversation and attachment content is deliberately included and may contain user-supplied sensitive text. Legacy single-turn sessions become one turn. Does not export request Logs or billing evidence.

Operation: `exportChatSession`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "adminBearerAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}/export" \
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

### id

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

Portable conversation JSON

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "format",
    "version",
    "turns"
  ],
  "properties": {
    "format": {
      "const": "niu-chat"
    },
    "version": {
      "const": 1
    },
    "title": {
      "type": "string"
    },
    "createdAt": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "turns": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "prompt",
          "results"
        ],
        "properties": {
          "prompt": {
            "type": "string"
          },
          "results": {
            "type": "array",
            "maxItems": 4,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "model",
                "content",
                "phase"
              ],
              "properties": {
                "model": {
                  "type": "string"
                },
                "content": {
                  "type": "string"
                },
                "phase": {
                  "type": "string",
                  "enum": [
                    "connecting",
                    "streaming",
                    "complete",
                    "failed",
                    "cancelled"
                  ]
                }
              }
            }
          },
          "attachments": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "name",
                "type",
                "content"
              ],
              "properties": {
                "name": {
                  "type": "string"
                },
                "type": {
                  "type": "string"
                },
                "content": {
                  "type": "string"
                }
              }
            }
          }
        }
      }
    }
  }
}
```

### HTTP 401

Authentication required

### HTTP 403

Workspace read access required

### HTTP 404

No saved conversation for this workspace and owner

### HTTP 503

Durable storage unavailable

## Behavior and supported scope

Requires workspace read access and the authenticated conversation owner. Reads durable content directly, including sessions outside the latest-100 list. Excludes internal identifiers, settings, diagnostic errors and accounting. Conversation and attachment content is deliberately included and may contain user-supplied sensitive text. Legacy single-turn sessions become one turn. Does not export request Logs or billing evidence.
