---
title: "Read the latest 100 workspace pool selections"
description: "GET /v1/routing/{slug}/selections"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/routing/{slug}/selections`

Requires a current workspace API key with delegated pools:read. Platform supply pools, procurement prices and credentials are never exposed. Links selected concrete model and policy revision to operation/attempt evidence when available. Auto selections include bounded decision outcome, path, fallback reason, failure, calls, tokens, latency and estimated customer decision charge when available; missing references remain unknown. HTTP status is not generation completion. Inspect generation diagnostics for terminal state, usage and customer charge coverage.

Operation: `getWorkspacePoolSelections`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  },
  {
    "niuApiKeyAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

Authentication alternative: `bearerAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/routing/{slug}/selections" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/routing/{slug}/selections" \
  -H "X-Niu-API-Key: $NIU_API_KEY"
```

## Parameters

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
          },
          "reference": {
            "type": [
              "string",
              "null"
            ]
          },
          "decision": {
            "type": [
              "object",
              "null"
            ],
            "description": "Bounded Auto decision outcome, path, fallback or failure reason, calls, tokens, latency and estimated customer decision charge. Null for non-Auto selections. No prompts, content, Provider identifiers or procurement prices."
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

Requires a current workspace API key with delegated pools:read. Platform supply pools, procurement prices and credentials are never exposed. Links selected concrete model and policy revision to operation/attempt evidence when available. Auto selections include bounded decision outcome, path, fallback reason, failure, calls, tokens, latency and estimated customer decision charge when available; missing references remain unknown. HTTP status is not generation completion. Inspect generation diagnostics for terminal state, usage and customer charge coverage.

**Supported scope:** implemented
