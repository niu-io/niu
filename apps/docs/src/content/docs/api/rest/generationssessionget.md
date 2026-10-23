---
title: "Read a private saved generations timeline"
description: "GET /api/v1/organizations/{organization}/projects/{project}/generations/{session}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/generations/{session}`

Reads accept a category-specific permanent public reference or legacy UUID. Both preserve the same private workspace/owner authorization. Mutation routes continue to require internal UUIDs. Actor-private within one workspace: installation credentials share the installation actor; each operator has an isolated owner. Current workspace Read is required for reads and Write for mutations; API-key inference credentials alone do not authorize these administrator routes. Saved-state reads and all writes never dispatch, refresh or replay inference. Read categories are video (default) and chat; legacy Chat write APIs remain unchanged. Revisions and sequences are decimal strings. Video instructions follow existing Chat/intents JSON storage (not application-encrypted at rest); Video content expires after 30 days and is hidden immediately, then cleared by retention maintenance. Task identity and history remain. Archive does not cancel tasks or remove outputs/billing.  Set category=chat for a read-only bridge over the existing actor-private Chat record. The same route defaults to video; IDs are scoped independently by category. Chat metadata uses database clocks and current guarded-write revision. Missing Chat title is null, never replaced by an internal ID. Chat turns preserve comparison branches, not one running conversation task. Per-turn creation/expiry clocks are unknown and null; missing retained prompt yields missing state and null instruction. Turn references are read-only scoped identity/sequence/instruction digests and cannot be used with Video writes. Branch phase/output are exact saved conversation content; actual execution references require a current workspace attempt and matching model. Customer charges are hydrated from the existing ledger projection; no saved procurement fields are returned. Chat retention and writes stay under the legacy Chat contract; Video 30-day instruction retention does not apply to this bridge.

Operation: `generationsSessionGet`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/generations/{session}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
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

### category

Location: **query**. Optional.

```json
{
  "type": "string",
  "enum": [
    "video",
    "chat"
  ],
  "default": "video"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Read a private saved video timeline

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "data": {
      "oneOf": [
        {
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
        },
        {
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
              "const": "chat"
            },
            "title": {
              "type": [
                "string",
                "null"
              ]
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
            "owner": {
              "type": "string",
              "description": "Internal authenticated actor reference; never a product display label."
            },
            "turns": {
              "type": "array",
              "items": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "id": {
                    "type": "string",
                    "pattern": "^chat-turn:[0-9a-f]{64}$",
                    "description": "Read-only derived reference from scoped session identity, sequence and retained instruction digest. Changing legacy instruction/order changes the reference; comparison output updates do not."
                  },
                  "kind": {
                    "type": "string",
                    "const": "chat"
                  },
                  "sequence": {
                    "type": "string",
                    "pattern": "^[1-9][0-9]*$"
                  },
                  "created_at": {
                    "type": "null"
                  },
                  "content_state": {
                    "type": "string",
                    "enum": [
                      "retained",
                      "missing"
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
                            "const": "chat"
                          },
                          "prompt": {
                            "type": "string"
                          },
                          "attachments": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "additionalProperties": false,
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
                              },
                              "required": [
                                "name",
                                "type",
                                "content"
                              ]
                            }
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
                    "type": "null"
                  },
                  "branches": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "properties": {
                        "model": {
                          "type": "string"
                        },
                        "content": {
                          "type": "string"
                        },
                        "elapsedMs": {
                          "type": "number"
                        },
                        "phase": {
                          "type": "string",
                          "enum": [
                            "connecting",
                            "streaming",
                            "complete",
                            "failed",
                            "cancelled"
                          ],
                          "description": "Saved client comparison phase, never authoritative task state or upstream cancellation."
                        },
                        "promptTokens": {
                          "type": [
                            "number",
                            "null"
                          ]
                        },
                        "completionTokens": {
                          "type": [
                            "number",
                            "null"
                          ]
                        },
                        "totalTokens": {
                          "type": [
                            "number",
                            "null"
                          ]
                        },
                        "error": {
                          "type": [
                            "string",
                            "null"
                          ]
                        },
                        "customerChargeNanos": {
                          "type": [
                            "string",
                            "null"
                          ]
                        },
                        "customerChargeCurrency": {
                          "type": [
                            "string",
                            "null"
                          ]
                        },
                        "customerChargeStatus": {
                          "type": "string",
                          "enum": [
                            "charged",
                            "owner_funded",
                            "pending",
                            "unpriced",
                            "not_charged",
                            "unknown"
                          ]
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
                                  "const": "chat"
                                },
                                "model": {
                                  "type": "string"
                                },
                                "execution": {
                                  "type": "string",
                                  "enum": [
                                    "not_sent",
                                    "may_have_executed",
                                    "confirmed_completed",
                                    "confirmed_not_executed"
                                  ]
                                }
                              },
                              "required": [
                                "id",
                                "kind",
                                "model",
                                "execution"
                              ]
                            },
                            {
                              "type": "null"
                            }
                          ]
                        }
                      },
                      "required": [
                        "task"
                      ]
                    }
                  }
                },
                "required": [
                  "id",
                  "kind",
                  "sequence",
                  "created_at",
                  "content_state",
                  "instruction",
                  "content_expires_at",
                  "branches"
                ]
              }
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
            "owner",
            "turns"
          ]
        }
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

### HTTP 413

Saved Chat payload exceeds the bounded 32 MiB materialization budget.

## Behavior and supported scope

Reads accept a category-specific permanent public reference or legacy UUID. Both preserve the same private workspace/owner authorization. Mutation routes continue to require internal UUIDs. Actor-private within one workspace: installation credentials share the installation actor; each operator has an isolated owner. Current workspace Read is required for reads and Write for mutations; API-key inference credentials alone do not authorize these administrator routes. Saved-state reads and all writes never dispatch, refresh or replay inference. Read categories are video (default) and chat; legacy Chat write APIs remain unchanged. Revisions and sequences are decimal strings. Video instructions follow existing Chat/intents JSON storage (not application-encrypted at rest); Video content expires after 30 days and is hidden immediately, then cleared by retention maintenance. Task identity and history remain. Archive does not cancel tasks or remove outputs/billing.  Set category=chat for a read-only bridge over the existing actor-private Chat record. The same route defaults to video; IDs are scoped independently by category. Chat metadata uses database clocks and current guarded-write revision. Missing Chat title is null, never replaced by an internal ID. Chat turns preserve comparison branches, not one running conversation task. Per-turn creation/expiry clocks are unknown and null; missing retained prompt yields missing state and null instruction. Turn references are read-only scoped identity/sequence/instruction digests and cannot be used with Video writes. Branch phase/output are exact saved conversation content; actual execution references require a current workspace attempt and matching model. Customer charges are hydrated from the existing ledger projection; no saved procurement fields are returned. Chat retention and writes stay under the legacy Chat contract; Video 30-day instruction retention does not apply to this bridge.

**Supported scope:** implemented
