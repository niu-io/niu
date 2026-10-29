---
title: "Read an output availability record"
description: "GET /api/v1/workspaces/{workspace}/artifacts/{task}/{kind}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/workspaces/{workspace}/artifacts/{task}/{kind}`

Current dashboard workspace Read authorizes saved history even when its inference key is revoked, expired, or its model grants changed. No active key secret is needed. Actor-private session/intent tasks belonging to another actor are excluded. API-created tasks without a private association are workspace-readable. No prompt, upstream URL, asset URI, credential or procurement field is returned. This GET never dispatches, refreshes, retries or settles inference. Task pages use immutable created_at/id DESC; artifacts use immutable output created_at/task_id/kind DESC. A cursor resolves in current authorized workspace independently of mutable state filters; malformed, missing or out-of-scope cursor is 400. Changing filters starts a new live view. No partial successful empty result: storage errors return 503. Artifact reference availability is retention evidence, not a guarantee the upstream bytes still exist. Content delivery performs only bounded result retrieval, rechecking dashboard access and retention after download. Content remains explicitly refused with 409 if its original Provider account/model binding is no longer current; historical read access never restores routing or credential authority. Existing key-scoped APIs and explicit refresh authorization remain unchanged. Chat stays in typed saved sessions; only Video execution inventory is supported. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

Operation: `generationsInventoryArtifactByWorkspace`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/workspaces/{workspace}/artifacts/{task}/{kind}" \
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

### task

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### kind

Location: **path**. **Required.**

```json
{
  "type": "string",
  "enum": [
    "video",
    "last_frame"
  ]
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
        "name": {
          "type": "string"
        },
        "created_at": {
          "type": "string",
          "format": "date-time"
        },
        "content_type": {
          "type": [
            "string",
            "null"
          ],
          "description": "Inspected captured-library content type when known; otherwise null."
        },
        "availability": {
          "enum": [
            "available",
            "deleted",
            "expired",
            "unavailable"
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
        "workspace_id": {
          "type": "string",
          "format": "uuid"
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
        "task_id",
        "kind",
        "name",
        "created_at",
        "content_type",
        "availability",
        "session_id",
        "turn_id",
        "workspace_id",
        "capture"
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

Current dashboard workspace Read authorizes saved history even when its inference key is revoked, expired, or its model grants changed. No active key secret is needed. Actor-private session/intent tasks belonging to another actor are excluded. API-created tasks without a private association are workspace-readable. No prompt, upstream URL, asset URI, credential or procurement field is returned. This GET never dispatches, refreshes, retries or settles inference. Task pages use immutable created_at/id DESC; artifacts use immutable output created_at/task_id/kind DESC. A cursor resolves in current authorized workspace independently of mutable state filters; malformed, missing or out-of-scope cursor is 400. Changing filters starts a new live view. No partial successful empty result: storage errors return 503. Artifact reference availability is retention evidence, not a guarantee the upstream bytes still exist. Content delivery performs only bounded result retrieval, rechecking dashboard access and retention after download. Content remains explicitly refused with 409 if its original Provider account/model binding is no longer current; historical read access never restores routing or credential authority. Existing key-scoped APIs and explicit refresh authorization remain unchanged. Chat stays in typed saved sessions; only Video execution inventory is supported. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

**Supported scope:** implemented
