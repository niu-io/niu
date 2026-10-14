---
title: "Read a saved Video task"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}`

Current dashboard workspace Read authorizes saved history even when its inference key is revoked, expired, or its model grants changed. No active key secret is needed. Actor-private session/intent tasks belonging to another actor are excluded. API-created tasks without a private association are workspace-readable. No prompt, upstream URL, asset URI, credential or procurement field is returned. This GET never dispatches, refreshes, retries or settles inference. Task pages use immutable created_at/id DESC; artifacts use immutable output created_at/task_id/kind DESC. A cursor resolves in current authorized workspace independently of mutable state filters; malformed, missing or out-of-scope cursor is 400. Changing filters starts a new live view. No partial successful empty result: storage errors return 503. Artifact reference availability is retention evidence, not a guarantee the upstream bytes still exist. Content delivery performs only bounded result retrieval, rechecking dashboard access and retention after download. Content remains explicitly refused with 409 if its original Provider account/model binding is no longer current; historical read access never restores routing or credential authority. Existing key-scoped APIs and explicit refresh authorization remain unchanged. Chat stays in typed saved sessions; only Video execution inventory is supported.

Operation: `generationsInventoryTask`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}" \
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

### task

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

Saved projection; complete true means this supported Video inventory read completed, not all task kinds.

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "kind": {
          "const": "video"
        },
        "model": {
          "type": "string"
        },
        "model_display_name": {
          "type": [
            "string",
            "null"
          ]
        },
        "created_at": {
          "type": "string",
          "format": "date-time"
        },
        "updated_at": {
          "type": "string",
          "format": "date-time"
        },
        "state": {
          "enum": [
            "queued",
            "running",
            "succeeded",
            "failed",
            "unknown",
            "submission_unknown",
            "reconciliation_required"
          ]
        },
        "source": {
          "enum": [
            "api",
            "generations",
            "unknown"
          ]
        },
        "session_id": {
          "type": [
            "string",
            "null"
          ],
          "format": "uuid"
        },
        "turn_id": {
          "type": [
            "string",
            "null"
          ],
          "format": "uuid"
        },
        "artifacts": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "kind": {
                "enum": [
                  "video",
                  "last_frame"
                ]
              },
              "availability": {
                "enum": [
                  "available",
                  "deleted",
                  "expired",
                  "unavailable"
                ]
              },
              "capture": {
                "oneOf": [
                  {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "id",
                      "task_id",
                      "kind",
                      "status",
                      "asset_id",
                      "availability",
                      "failure_code",
                      "created_at",
                      "updated_at"
                    ],
                    "properties": {
                      "id": {
                        "type": "string",
                        "format": "uuid"
                      },
                      "task_id": {
                        "type": "string",
                        "format": "uuid"
                      },
                      "kind": {
                        "enum": [
                          "video",
                          "last_frame"
                        ]
                      },
                      "status": {
                        "enum": [
                          "preparing",
                          "stored",
                          "failed"
                        ]
                      },
                      "asset_id": {
                        "type": [
                          "string",
                          "null"
                        ],
                        "format": "uuid"
                      },
                      "availability": {
                        "enum": [
                          "retained",
                          "deleted",
                          "not_stored"
                        ]
                      },
                      "failure_code": {
                        "enum": [
                          null,
                          "delivery_failed",
                          "authorization_changed",
                          "invalid_media",
                          "capacity_exceeded",
                          "storage_unavailable",
                          "encryption_unavailable"
                        ]
                      },
                      "created_at": {
                        "type": "string",
                        "format": "date-time"
                      },
                      "updated_at": {
                        "type": "string",
                        "format": "date-time"
                      }
                    }
                  },
                  {
                    "type": "null"
                  }
                ]
              }
            },
            "required": [
              "kind",
              "availability",
              "capture"
            ]
          }
        },
        "execution_context": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "submitted_model",
            "dispatched_model",
            "provider",
            "channel",
            "dispatched_at",
            "source",
            "parameters_source",
            "references_state",
            "parameters"
          ],
          "properties": {
            "submitted_model": {
              "type": "string"
            },
            "dispatched_model": {
              "type": [
                "string",
                "null"
              ]
            },
            "provider": {
              "type": [
                "string",
                "null"
              ],
              "description": "Adapter recorded at dispatch; not a Provider account name."
            },
            "channel": {
              "type": [
                "string",
                "null"
              ]
            },
            "dispatched_at": {
              "type": "string",
              "format": "date-time"
            },
            "source": {
              "const": "saved_execution"
            },
            "parameters_source": {
              "enum": [
                "saved_validated_snapshot",
                "unknown"
              ]
            },
            "references_state": {
              "const": "not_in_execution_snapshot"
            },
            "parameters": {
              "type": [
                "object",
                "null"
              ],
              "additionalProperties": false,
              "properties": {
                "duration": {
                  "type": "number"
                },
                "seed": {
                  "type": "number"
                },
                "frames_per_second": {
                  "type": "number"
                },
                "watermark": {
                  "type": "boolean"
                },
                "camera_fixed": {
                  "type": "boolean"
                },
                "return_last_frame": {
                  "type": "boolean"
                },
                "resolution": {
                  "type": "string"
                },
                "ratio": {
                  "type": "string"
                },
                "omni_reference_task_type": {
                  "type": "string"
                }
              }
            }
          }
        },
        "model_display_name_source": {
          "enum": [
            "current_catalog",
            "unknown"
          ]
        }
      },
      "required": [
        "id",
        "kind",
        "model",
        "model_display_name",
        "created_at",
        "updated_at",
        "state",
        "source",
        "session_id",
        "turn_id",
        "artifacts",
        "execution_context",
        "model_display_name_source"
      ]
    }
  },
  "required": [
    "data"
  ]
}
```

### HTTP 400

Invalid query, unsupported kind or inaccessible cursor

### HTTP 401

Session invalid or expired

### HTTP 403

Current workspace permission denied

### HTTP 404

Record missing or actor-inaccessible

### HTTP 409

Original Provider delivery binding is no longer current; metadata history remains readable.

### HTTP 503

Saved read unavailable; never presented as empty inventory

## Behavior and supported scope

Current dashboard workspace Read authorizes saved history even when its inference key is revoked, expired, or its model grants changed. No active key secret is needed. Actor-private session/intent tasks belonging to another actor are excluded. API-created tasks without a private association are workspace-readable. No prompt, upstream URL, asset URI, credential or procurement field is returned. This GET never dispatches, refreshes, retries or settles inference. Task pages use immutable created_at/id DESC; artifacts use immutable output created_at/task_id/kind DESC. A cursor resolves in current authorized workspace independently of mutable state filters; malformed, missing or out-of-scope cursor is 400. Changing filters starts a new live view. No partial successful empty result: storage errors return 503. Artifact reference availability is retention evidence, not a guarantee the upstream bytes still exist. Content delivery performs only bounded result retrieval, rechecking dashboard access and retention after download. Content remains explicitly refused with 409 if its original Provider account/model binding is no longer current; historical read access never restores routing or credential authority. Existing key-scoped APIs and explicit refresh authorization remain unchanged. Chat stays in typed saved sessions; only Video execution inventory is supported.

**Supported scope:** implemented
