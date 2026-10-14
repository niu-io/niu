---
title: "Explicitly save a generated output into workspace materials"
description: "POST /admin/v1/organizations/{organization}/projects/{project}/generations/artifacts/{task}/{kind}/capture"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/organizations/{organization}/projects/{project}/generations/artifacts/{task}/{kind}/capture`

Current dashboard workspace Write permission and actor-visible original task required. Task/output identity is scoped; no Provider URLs, private references, credentials or costs are returned. Explicit bounded copy into the existing encrypted workspace material library, not Provider registration or generation. Cached mode uses unexpired saved references under historical access; fresh mode explicitly queries the original task then retrieves output, using optional selected current workspace key or original-key fallback. The selected key cannot replace the immutable Provider/account/model/channel. Original expired keys without explicit current authority refuse fresh actions. Upstream operations never retry automatically. Two process capture slots; transport and format validation limited to8MiB; existing256asset/256MiB workspace quotas remain. A durable2minute preparing lease is committed before retrieval. Only an explicit repeated POST recovers failed/expired claims. Same requestid with changed fields409; a NEW requestid may change mode after failure; source identity prevents duplicate active/stored captures. Stored source replay returns canonical retained/deleted outcome without network; deleted retained bytes are never resurrected. Asset bytes, source provenance, quota and audit commit atomically after rechecking visibility under the source task lock. Failed delivery returns its error and retains a safe failed claim when storage is available; ambiguous failure-record writes leave preparing, not false availability. Cached expiry/deletion and original task/pricing identity are not rewritten. Fresh status queries may append diagnosis and settle an original pending liability through existing recovery, never create a new generation or reprice it. Saving shares copied bytes with authorized workspace members through the existing library; Provider readiness and verified identity remain separate.

Operation: `captureGenerationsArtifact`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/generations/artifacts/{task}/{kind}/capture" \
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

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "name",
    "mode"
  ],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "description": "Canonical nonnil request identity retained before sending."
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200,
      "description": "Exact trimmed UTF8 name, at most200 bytes, no control characters."
    },
    "mode": {
      "enum": [
        "cached",
        "fresh"
      ]
    },
    "key_id": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid",
      "description": "Only fresh: explicit current workspace key authority; original Provider binding never changes."
    }
  }
}
```

## Responses

### HTTP 200

Saved capture metadata; retained means actual encrypted library bytes were committed, independent of Provider URL expiry.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data"
  ],
  "properties": {
    "data": {
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
    }
  }
}
```

### HTTP 400

Invalid capture request or media bytes

### HTTP 401

Sign-in required

### HTTP 403

Workspace or current key authority denied

### HTTP 404

Missing/private task, capture, or unavailable source

### HTTP 409

Active lease, changed replay, quota exceeded or binding/visibility conflict

### HTTP 413

Source bytes exceed8MiB

### HTTP 502

Upstream query or delivery failed

### HTTP 503

Capture capacity, configuration or storage unavailable

### HTTP 504

Upstream query or delivery timeout

## Behavior and supported scope

Current dashboard workspace Write permission and actor-visible original task required. Task/output identity is scoped; no Provider URLs, private references, credentials or costs are returned. Explicit bounded copy into the existing encrypted workspace material library, not Provider registration or generation. Cached mode uses unexpired saved references under historical access; fresh mode explicitly queries the original task then retrieves output, using optional selected current workspace key or original-key fallback. The selected key cannot replace the immutable Provider/account/model/channel. Original expired keys without explicit current authority refuse fresh actions. Upstream operations never retry automatically. Two process capture slots; transport and format validation limited to8MiB; existing256asset/256MiB workspace quotas remain. A durable2minute preparing lease is committed before retrieval. Only an explicit repeated POST recovers failed/expired claims. Same requestid with changed fields409; a NEW requestid may change mode after failure; source identity prevents duplicate active/stored captures. Stored source replay returns canonical retained/deleted outcome without network; deleted retained bytes are never resurrected. Asset bytes, source provenance, quota and audit commit atomically after rechecking visibility under the source task lock. Failed delivery returns its error and retains a safe failed claim when storage is available; ambiguous failure-record writes leave preparing, not false availability. Cached expiry/deletion and original task/pricing identity are not rewritten. Fresh status queries may append diagnosis and settle an original pending liability through existing recovery, never create a new generation or reprice it. Saving shares copied bytes with authorized workspace members through the existing library; Provider readiness and verified identity remain separate.

**Supported scope:** implemented
