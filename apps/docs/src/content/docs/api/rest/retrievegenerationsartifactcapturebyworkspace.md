---
title: "Read saved artifact capture status"
description: "GET /api/v1/workspaces/{workspace}/artifacts/{task}/{kind}/capture"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/workspaces/{workspace}/artifacts/{task}/{kind}/capture`

Current dashboard workspace Read permission and actor-visible original task required. Task/output identity is scoped; no Provider URLs, private references, credentials or costs are returned. Saved claim metadata only; no download, refresh, retry, generation or ledger mutation. Source lookup returns the stored/active outcome or newest failed request; missing/private task or missing capture404. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

Operation: `retrieveGenerationsArtifactCaptureByWorkspace`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/workspaces/{workspace}/artifacts/{task}/{kind}/capture" \
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

Current dashboard workspace Read permission and actor-visible original task required. Task/output identity is scoped; no Provider URLs, private references, credentials or costs are returned. Saved claim metadata only; no download, refresh, retry, generation or ledger mutation. Source lookup returns the stored/active outcome or newest failed request; missing/private task or missing capture404. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

**Supported scope:** implemented
