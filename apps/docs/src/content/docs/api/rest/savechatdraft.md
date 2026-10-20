---
title: "Save or clear the personal Chat draft with an expected revision"
description: "PUT /api/v1/organizations/{organization}/projects/{project}/chats/draft"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/organizations/{organization}/projects/{project}/chats/draft`

Write authorization and workspace scope are required. Browser-member requests require an allowed Origin when password authentication is configured; other requests also undergo Origin validation. Strict typed JSON rejects unknown fields. A referenced conversation must belong to the same owner and workspace. Saving does not call a model. The 24 MiB route body bound applies. Compare-and-swap prevents stale tabs from overwriting a newer draft; clearing retains and advances the revision.

Operation: `saveChatDraft`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/chats/draft" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "expected_revision"
  ],
  "properties": {
    "expected_revision": {
      "type": "integer",
      "format": "int64",
      "description": "Exact last observed integer revision. Negative or stale values return 409; use zero for initial creation."
    },
    "payload": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "prompt",
            "models",
            "attachments",
            "settings"
          ],
          "properties": {
            "sessionId": {
              "oneOf": [
                {
                  "type": "string",
                  "format": "uuid",
                  "description": "Optional saved conversation belonging to this owner and workspace."
                },
                {
                  "type": "null"
                }
              ]
            },
            "prompt": {
              "type": "string",
              "maxLength": 12000
            },
            "models": {
              "type": "array",
              "maxItems": 4,
              "uniqueItems": true,
              "items": {
                "type": "string",
                "minLength": 1,
                "description": "Nonblank and at most 512 UTF-8 bytes; saving a draft does not invoke or grant access to this model."
              }
            },
            "attachments": {
              "type": "array",
              "maxItems": 4,
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
                    "type": "string",
                    "minLength": 1,
                    "description": "At most 1024 UTF-8 bytes."
                  },
                  "type": {
                    "type": "string",
                    "enum": [
                      "image",
                      "text"
                    ]
                  },
                  "content": {
                    "type": "string",
                    "description": "At most 6291456 UTF-8 bytes; stored text, not a server-fetched URL."
                  }
                }
              }
            },
            "settings": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "systemPrompt",
                "maxTokens",
                "temperature",
                "logPayloads"
              ],
              "properties": {
                "systemPrompt": {
                  "type": "string",
                  "maxLength": 12000
                },
                "maxTokens": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 9007199254740991
                },
                "temperature": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 2
                },
                "logPayloads": {
                  "type": "boolean"
                }
              }
            }
          }
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "description": "An omitted or null payload clears the draft while retaining its revision."
}
```

## Responses

### HTTP 200

Saved personal draft state.

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
        "payload",
        "revision"
      ],
      "properties": {
        "payload": {
          "oneOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "prompt",
                "models",
                "attachments",
                "settings"
              ],
              "properties": {
                "sessionId": {
                  "oneOf": [
                    {
                      "type": "string",
                      "format": "uuid",
                      "description": "Optional saved conversation belonging to this owner and workspace."
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "prompt": {
                  "type": "string",
                  "maxLength": 12000
                },
                "models": {
                  "type": "array",
                  "maxItems": 4,
                  "uniqueItems": true,
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "description": "Nonblank and at most 512 UTF-8 bytes; saving a draft does not invoke or grant access to this model."
                  }
                },
                "attachments": {
                  "type": "array",
                  "maxItems": 4,
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
                        "type": "string",
                        "minLength": 1,
                        "description": "At most 1024 UTF-8 bytes."
                      },
                      "type": {
                        "type": "string",
                        "enum": [
                          "image",
                          "text"
                        ]
                      },
                      "content": {
                        "type": "string",
                        "description": "At most 6291456 UTF-8 bytes; stored text, not a server-fetched URL."
                      }
                    }
                  }
                },
                "settings": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "systemPrompt",
                    "maxTokens",
                    "temperature",
                    "logPayloads"
                  ],
                  "properties": {
                    "systemPrompt": {
                      "type": "string",
                      "maxLength": 12000
                    },
                    "maxTokens": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 9007199254740991
                    },
                    "temperature": {
                      "type": "number",
                      "minimum": 0,
                      "maximum": 2
                    },
                    "logPayloads": {
                      "type": "boolean"
                    }
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
          "format": "int64",
          "minimum": 0,
          "description": "Zero before the first saved draft; integer revision, not a string."
        }
      }
    }
  }
}
```

### HTTP 400

Malformed or unknown JSON fields, invalid payload limits, or unavailable owner-scoped conversation.

### HTTP 401

Missing or invalid administration/member authentication.

### HTTP 403

Insufficient permission or workspace scope. Missing or disallowed browser Origin also refuses the write.

### HTTP 409

Negative, stale or unavailable expected revision; no draft overwrite.

### HTTP 500

Internal storage failure.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Write authorization and workspace scope are required. Browser-member requests require an allowed Origin when password authentication is configured; other requests also undergo Origin validation. Strict typed JSON rejects unknown fields. A referenced conversation must belong to the same owner and workspace. Saving does not call a model. The 24 MiB route body bound applies. Compare-and-swap prevents stale tabs from overwriting a newer draft; clearing retains and advances the revision.

**Supported scope:** implemented
