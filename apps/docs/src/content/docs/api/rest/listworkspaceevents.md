---
title: "Read workspace resource events"
description: "GET /v1/events/log"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/events/log`

Requires a current workspace API key with explicitly delegated events:read. Responses are no-store. Returns at most 100 events ascending with decimal sequence cursors. An absent cursor starts at zero. Continue using next_after; future/out-of-range cursors return 409. Events are immutable and no pruning window is enabled. Stable event identity supports deduplication; replay through this read does not dispatch a webhook. Contains resource identity/revision and time, no model prompts or commercial procurement data.

Operation: `listWorkspaceEvents`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/events/log" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/events/log" \
  -H "X-Niu-API-Key: $NIU_API_KEY"
```

## Parameters

### after

Location: **query**. Optional.

```json
{
  "type": "string",
  "pattern": "^[0-9]+$"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Scoped result

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
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "sequence": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "type": {
            "type": "string",
            "enum": [
              "pool.changed",
              "evaluation.recorded",
              "incident.opened",
              "incident.resolved",
              "subscription.test"
            ]
          },
          "schema_version": {
            "type": "integer",
            "const": 1
          },
          "occurred_at": {
            "type": "string",
            "format": "date-time"
          },
          "resource": {
            "type": "object",
            "properties": {
              "kind": {
                "type": "string",
                "enum": [
                  "pool",
                  "evaluation",
                  "incident",
                  "subscription"
                ]
              },
              "slug": {
                "type": "string"
              },
              "revision": {
                "type": "integer"
              },
              "run": {
                "type": "string",
                "description": "Immutable run slug, present for evaluation.recorded. Retrieve under evaluations:read."
              }
            }
          }
        }
      }
    },
    "has_more": {
      "type": "boolean"
    },
    "next_after": {
      "type": "string"
    },
    "retention": {
      "type": "string",
      "const": "no_pruning"
    }
  }
}
```

### HTTP 400

Invalid configuration or cursor

### HTTP 401

Invalid, expired or revoked key

### HTTP 403

Required current delegation is absent

### HTTP 404

Scoped subscription not found

### HTTP 409

Revision, quota or cursor conflict

### HTTP 503

Required encryption or storage unavailable

## Behavior and supported scope

Requires a current workspace API key with explicitly delegated events:read. Responses are no-store. Returns at most 100 events ascending with decimal sequence cursors. An absent cursor starts at zero. Continue using next_after; future/out-of-range cursors return 409. Events are immutable and no pruning window is enabled. Stable event identity supports deduplication; replay through this read does not dispatch a webhook. Contains resource identity/revision and time, no model prompts or commercial procurement data.

**Supported scope:** implemented
