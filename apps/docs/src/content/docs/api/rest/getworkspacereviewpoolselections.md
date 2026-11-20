---
title: "Review: Read the latest 100 workspace pool selections"
description: "GET /api/v1/workspaces/{workspace}/routing/{slug}/selections"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/workspaces/{workspace}/routing/{slug}/selections`

Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.

Operation: `getWorkspaceReviewPoolSelections`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/workspaces/{workspace}/routing/{slug}/selections" \
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

### slug

Location: **path**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
  "maxLength": 80
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Workspace-scoped result; no-store.

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "pool_revision": {
            "type": "integer"
          },
          "selected_model": {
            "type": "string"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "operation_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "attempt_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "response_status": {
            "type": [
              "integer",
              "null"
            ],
            "description": "Returned HTTP status, not terminal stream completion or task acceptance."
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid configuration or cursor

### HTTP 401

Missing, expired or revoked credential

### HTTP 403

Required delegated capability is absent

### HTTP 404

Scoped pool not found

### HTTP 409

Expected revision conflict

## Behavior and supported scope

Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.

**Supported scope:** implemented
