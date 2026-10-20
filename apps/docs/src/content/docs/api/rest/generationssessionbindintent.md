---
title: "Bind a saved Video intent to a private turn"
description: "PUT /api/v1/organizations/{organization}/projects/{project}/generations/{session}/turns/{turn}/intent"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/organizations/{organization}/projects/{project}/generations/{session}/turns/{turn}/intent`

Current workspace Write and actor-owned video session/turn/intent required. This only binds saved restoration identity and never dispatches, refreshes or automatically submits inference. One turn and one intent form an immutable association within the same owner/workspace. A fresh association requires expected session revision, an unarchived session and retained turn/intent content. Identical binding retries are side-effect-free even after revision advances, archive, deletion or expiry; changed binding conflicts. If the turn already references a task, it must equal the actual attempt from the original intent submission identity. Session reads resolve any saved original attempt directly from that identity after a lost submission/association response without another inference call. Pending/not-dispatched/unknown outcomes are never assumed free or safe to resend. Safe intent projection includes id, revision, model, content state and submission state, not raw request, key secret or private upstream references. Turn content deletion/expiry clears the bound retained intent copy under turn-to-intent locking while preserving submission tombstones, task evidence, billing and diagnostics. Intent and turn keep their original 30-day retention deadlines; neither is extended. Legacy Video intent APIs remain compatible and explicit submission continues through their submit endpoint. The bound intent is canonical for the actual restored Video draft/request, including model, controls and material inputs. The separately saved turn instruction may be a review note and is not represented as proof of the dispatched prompt; reads never substitute it for missing retained intent content.

Operation: `generationsSessionBindIntent`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/generations/{session}/turns/{turn}/intent" \
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
    },
    "intent_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "expected_revision",
    "intent_id"
  ]
}
```

## Responses

### HTTP 200

Attach an existing authorized video task

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

Current workspace Write and actor-owned video session/turn/intent required. This only binds saved restoration identity and never dispatches, refreshes or automatically submits inference. One turn and one intent form an immutable association within the same owner/workspace. A fresh association requires expected session revision, an unarchived session and retained turn/intent content. Identical binding retries are side-effect-free even after revision advances, archive, deletion or expiry; changed binding conflicts. If the turn already references a task, it must equal the actual attempt from the original intent submission identity. Session reads resolve any saved original attempt directly from that identity after a lost submission/association response without another inference call. Pending/not-dispatched/unknown outcomes are never assumed free or safe to resend. Safe intent projection includes id, revision, model, content state and submission state, not raw request, key secret or private upstream references. Turn content deletion/expiry clears the bound retained intent copy under turn-to-intent locking while preserving submission tombstones, task evidence, billing and diagnostics. Intent and turn keep their original 30-day retention deadlines; neither is extended. Legacy Video intent APIs remain compatible and explicit submission continues through their submit endpoint. The bound intent is canonical for the actual restored Video draft/request, including model, controls and material inputs. The separately saved turn instruction may be a review note and is not represented as proof of the dispatched prompt; reads never substitute it for missing retained intent content.

**Supported scope:** implemented
