---
title: "Delete retained instruction content"
description: "DELETE /admin/v1/organizations/{organization}/projects/{project}/generations-sessions/{session}/turns/{turn}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /admin/v1/organizations/{organization}/projects/{project}/generations-sessions/{session}/turns/{turn}`

Actor-private within one workspace: installation credentials share the installation actor; each operator has an isolated owner. Current workspace Read is required for reads and Write for mutations; API-key inference credentials alone do not authorize these administrator routes. Saved-state reads and all writes never dispatch, refresh or replay inference. New writes use video category only; legacy Chat writes remain unchanged, while category=chat reads use a compatible projection. Revisions and sequences are decimal strings. Instructions follow existing Chat/intents JSON storage (not application-encrypted at rest); content expires after 30 days and is hidden immediately, then cleared by retention maintenance. Task identity and history remain. Archive does not cancel tasks or remove outputs/billing. Expected session revision is required; deletes only instruction content, retaining turn identity and immutable task association.

Operation: `generationsSessionDeleteInstruction`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/generations-sessions/{session}/turns/{turn}" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
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

### session

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### turn

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
  "properties": {
    "expected_revision": {
      "type": "string",
      "pattern": "^[1-9][0-9]*$"
    }
  },
  "required": [
    "expected_revision"
  ]
}
```

## Responses

### HTTP 200

Delete retained instruction content

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "data": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "workspace_id": {
          "type": "string",
          "format": "uuid"
        },
        "category": {
          "type": "string",
          "const": "video"
        },
        "title": {
          "type": "string"
        },
        "revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        },
        "archived": {
          "type": "boolean"
        },
        "created_at": {
          "type": "string",
          "format": "date-time"
        },
        "updated_at": {
          "type": "string",
          "format": "date-time"
        },
        "turns": {
          "type": "array",
          "maxItems": 100,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "id": {
                "type": "string",
                "format": "uuid"
              },
              "sequence": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              },
              "created_at": {
                "type": "string",
                "format": "date-time"
              },
              "content_state": {
                "type": "string",
                "enum": [
                  "retained",
                  "deleted",
                  "expired"
                ]
              },
              "instruction": {
                "oneOf": [
                  {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                      "kind": {
                        "type": "string",
                        "const": "video"
                      },
                      "prompt": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 61440
                      }
                    },
                    "required": [
                      "kind",
                      "prompt"
                    ]
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "content_expires_at": {
                "type": "string",
                "format": "date-time"
              },
              "task_id": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "uuid"
              },
              "task": {
                "oneOf": [
                  {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                      "id": {
                        "type": "string",
                        "format": "uuid"
                      },
                      "kind": {
                        "type": "string",
                        "const": "video"
                      },
                      "model": {
                        "type": "string"
                      },
                      "status": {
                        "type": "string",
                        "enum": [
                          "submission_unknown",
                          "queued",
                          "running",
                          "succeeded",
                          "failed",
                          "unknown",
                          "reconciliation_required"
                        ]
                      },
                      "artifacts": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "additionalProperties": false,
                          "required": [
                            "task_id",
                            "kind",
                            "availability"
                          ],
                          "properties": {
                            "task_id": {
                              "type": "string",
                              "format": "uuid"
                            },
                            "kind": {
                              "type": "string",
                              "enum": [
                                "video",
                                "last_frame"
                              ]
                            },
                            "availability": {
                              "type": "string",
                              "enum": [
                                "available",
                                "expired",
                                "deleted",
                                "unavailable"
                              ]
                            }
                          }
                        }
                      }
                    },
                    "required": [
                      "id",
                      "kind",
                      "model",
                      "status",
                      "artifacts"
                    ]
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "intent": {
                "oneOf": [
                  {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "id",
                      "revision",
                      "model",
                      "content_state",
                      "submission_state",
                      "task_id"
                    ],
                    "properties": {
                      "id": {
                        "type": "string",
                        "format": "uuid"
                      },
                      "revision": {
                        "type": "string",
                        "pattern": "^[1-9][0-9]*$"
                      },
                      "model": {
                        "type": "string"
                      },
                      "content_state": {
                        "enum": [
                          "retained",
                          "deleted",
                          "expired"
                        ]
                      },
                      "submission_state": {
                        "enum": [
                          "saved",
                          "not_dispatched",
                          "dispatched"
                        ]
                      },
                      "task_id": {
                        "type": [
                          "string",
                          "null"
                        ],
                        "format": "uuid"
                      }
                    },
                    "description": "Canonical retained model/controls/material draft is restored through the existing getVideoIntent contract; this safe reference contains no raw request. The turn instruction is the separately saved user instruction/review note, not asserted to be the historical submitted prompt."
                  },
                  {
                    "type": "null"
                  }
                ]
              }
            },
            "required": [
              "id",
              "sequence",
              "created_at",
              "content_state",
              "instruction",
              "content_expires_at",
              "task_id",
              "task",
              "intent"
            ]
          }
        },
        "owner": {
          "type": "string",
          "description": "Internal authenticated actor reference; never a product display label."
        }
      },
      "required": [
        "id",
        "workspace_id",
        "category",
        "title",
        "revision",
        "archived",
        "created_at",
        "updated_at",
        "turns",
        "owner"
      ]
    }
  },
  "required": [
    "data"
  ]
}
```

### HTTP 400

Invalid request or cursor

### HTTP 401

Invalid administrator session or unauthorized historical task

### HTTP 403

Current workspace permission denied

### HTTP 404

Actor-owned session is absent

### HTTP 409

Stale revision, changed idempotent identity, archive or task association conflict

## Behavior and supported scope

Actor-private within one workspace: installation credentials share the installation actor; each operator has an isolated owner. Current workspace Read is required for reads and Write for mutations; API-key inference credentials alone do not authorize these administrator routes. Saved-state reads and all writes never dispatch, refresh or replay inference. New writes use video category only; legacy Chat writes remain unchanged, while category=chat reads use a compatible projection. Revisions and sequences are decimal strings. Instructions follow existing Chat/intents JSON storage (not application-encrypted at rest); content expires after 30 days and is hidden immediately, then cleared by retention maintenance. Task identity and history remain. Archive does not cancel tasks or remove outputs/billing. Expected session revision is required; deletes only instruction content, retaining turn identity and immutable task association.

**Supported scope:** implemented
