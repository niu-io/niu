---
title: "Save an owned Chat session in a workspace"
description: "PUT /api/v1/organizations/{organization}/projects/{project}/chats/{id}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/organizations/{organization}/projects/{project}/chats/{id}`

Requires workspace write access. Stores conversation content separately from accounting. Only supported top-level and nested fields are retained. Client-supplied accounting fields are discarded. Numeric timestamps, durations and token counts must be nonnegative JavaScript-safe integers; token counts may be null. Settings and attachment shapes are validated. This endpoint does not establish authoritative request charges or detect secrets embedded in conversation text. Omit expectedRevision for a compatibility write only while the owned record has not enabled guarded writes. Explicit null creates only if no owned row exists; a canonical positive decimal revision updates only that exact owned version. Stale, missing or duplicate-create guarded writes return 409 without replacing content. Revisions are global sequence values, not timestamps, and are never reused by API delete/recreate. Guarded success includes a decimal revision; direct GET provides it. A successful guarded creation/update permanently enables guarded writes on that owned row. Compatibility saves thereafter return 409; there is no content-write downgrade. A content-free guard identity survives deletion, so legacy autosaves cannot resurrect a protected reference; explicit null guarded creation may recreate it. Untouched legacy rows retain compatibility behavior until guarded save.

Operation: `saveChatSession`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/chats/{id}" \
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

### id

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

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

### application/json

**Required.**



```json
{
  "type": "object",
  "required": [
    "prompt",
    "results",
    "createdAt"
  ],
  "properties": {
    "prompt": {
      "type": "string"
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
      "description": "Ordered conversation turns. Each retains its prompt and up to four model responses, validated with the same result fields as the current turn. Unknown turn/result fields are stripped. Optional for legacy single-turn sessions.",
      "items": {
        "type": "object",
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
              "type": "object"
            }
          },
          "attachments": {
            "type": "array",
            "items": {
              "type": "object",
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
    },
    "results": {
      "type": "array",
      "maxItems": 4,
      "items": {
        "type": "object",
        "required": [
          "model",
          "content",
          "elapsedMs",
          "phase"
        ],
        "properties": {
          "model": {
            "type": "string"
          },
          "content": {
            "type": "string"
          },
          "elapsedMs": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
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
          },
          "promptTokens": {
            "type": [
              "integer",
              "null"
            ],
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "completionTokens": {
            "type": [
              "integer",
              "null"
            ],
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "totalTokens": {
            "type": [
              "integer",
              "null"
            ],
            "minimum": 0,
            "maximum": 9007199254740991
          }
        }
      }
    },
    "settings": {
      "type": "object",
      "properties": {
        "systemPrompt": {
          "type": "string"
        },
        "maxTokens": {
          "type": "integer",
          "minimum": 1
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
    },
    "attachments": {
      "type": "array",
      "items": {
        "type": "object",
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
    },
    "expectedRevision": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[1-9][0-9]*$",
      "description": "Omitted: compatibility write. Null: create-only. Positive decimal string: exact current revision from GET."
    }
  }
}
```

## Responses

### HTTP 200

Compatibility saved flag, or confirmed guarded saved flag, revision and guardedWrites=true.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "saved"
  ],
  "properties": {
    "saved": {
      "const": true
    },
    "revision": {
      "type": "string",
      "pattern": "^[1-9][0-9]*$"
    },
    "guardedWrites": {
      "const": true,
      "description": "Present with revision only for confirmed guarded saves; older compatibility servers do not confirm this mode."
    }
  }
}
```

### HTTP 400

Invalid content or expected revision.

### HTTP 401

Authentication required.

### HTTP 403

Workspace write access required.

### HTTP 409

Guarded creation/update does not match current owned state.

### HTTP 413

Request exceeds the 24 MiB transport limit.

### HTTP 503

Storage unavailable or bounded write wait exceeded.

## Behavior and supported scope

Requires workspace write access. Stores conversation content separately from accounting. Only supported top-level and nested fields are retained. Client-supplied accounting fields are discarded. Numeric timestamps, durations and token counts must be nonnegative JavaScript-safe integers; token counts may be null. Settings and attachment shapes are validated. This endpoint does not establish authoritative request charges or detect secrets embedded in conversation text. Omit expectedRevision for a compatibility write only while the owned record has not enabled guarded writes. Explicit null creates only if no owned row exists; a canonical positive decimal revision updates only that exact owned version. Stale, missing or duplicate-create guarded writes return 409 without replacing content. Revisions are global sequence values, not timestamps, and are never reused by API delete/recreate. Guarded success includes a decimal revision; direct GET provides it. A successful guarded creation/update permanently enables guarded writes on that owned row. Compatibility saves thereafter return 409; there is no content-write downgrade. A content-free guard identity survives deletion, so legacy autosaves cannot resurrect a protected reference; explicit null guarded creation may recreate it. Untouched legacy rows retain compatibility behavior until guarded save.

**Supported scope:** implemented
