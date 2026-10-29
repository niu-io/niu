---
title: "List private generations sessions"
description: "GET /api/v1/organizations/{organization}/projects/{project}/generations"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/generations`

Actor-private within one workspace: installation credentials share the installation actor; each operator has an isolated owner. Current workspace Read is required for reads and Write for mutations; API-key inference credentials alone do not authorize these administrator routes. Saved-state reads and all writes never dispatch, refresh or replay inference. Read categories are video (default) and chat; legacy Chat write APIs remain unchanged. Revisions and sequences are decimal strings. Video instructions follow existing Chat/intents JSON storage (not application-encrypted at rest); Video content expires after 30 days and is hidden immediately, then cleared by retention maintenance. Task identity and history remain. Archive does not cancel tasks or remove outputs/billing. Stable descending creation time then UUID pagination; before refers to an actor-visible record independently of its current archive state; archiving a prior page cursor does not invalidate traversal. Invalid cursor returns 400, never an empty page. Limit 1..100; next_before is null when exhausted. Set category=chat for a read-only bridge over the existing actor-private Chat record. The same route defaults to video; IDs are scoped independently by category. Chat metadata uses database clocks and current guarded-write revision. Missing Chat title is null, never replaced by an internal ID. Chat turns preserve comparison branches, not one running conversation task. Per-turn creation/expiry clocks are unknown and null; missing retained prompt yields missing state and null instruction. Turn references are read-only scoped identity/sequence/instruction digests and cannot be used with Video writes. Branch phase/output are exact saved conversation content; actual execution references require a current workspace attempt and matching model. Customer charges are hydrated from the existing ledger projection; no saved procurement fields are returned. Chat retention and writes stay under the legacy Chat contract; Video 30-day instruction retention does not apply to this bridge.

Operation: `generationsSessionList`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/generations" \
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

### before

Location: **query**. Optional.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 20
}
```

### archived

Location: **query**. Optional.

```json
{
  "type": "boolean",
  "default": false
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

List private video generations sessions

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "data": {
      "type": "array",
      "items": {
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
              "owner"
            ]
          }
        ]
      }
    },
    "has_more": {
      "type": "boolean"
    },
    "next_before": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    }
  },
  "required": [
    "data",
    "has_more",
    "next_before"
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

Actor-private within one workspace: installation credentials share the installation actor; each operator has an isolated owner. Current workspace Read is required for reads and Write for mutations; API-key inference credentials alone do not authorize these administrator routes. Saved-state reads and all writes never dispatch, refresh or replay inference. Read categories are video (default) and chat; legacy Chat write APIs remain unchanged. Revisions and sequences are decimal strings. Video instructions follow existing Chat/intents JSON storage (not application-encrypted at rest); Video content expires after 30 days and is hidden immediately, then cleared by retention maintenance. Task identity and history remain. Archive does not cancel tasks or remove outputs/billing. Stable descending creation time then UUID pagination; before refers to an actor-visible record independently of its current archive state; archiving a prior page cursor does not invalidate traversal. Invalid cursor returns 400, never an empty page. Limit 1..100; next_before is null when exhausted. Set category=chat for a read-only bridge over the existing actor-private Chat record. The same route defaults to video; IDs are scoped independently by category. Chat metadata uses database clocks and current guarded-write revision. Missing Chat title is null, never replaced by an internal ID. Chat turns preserve comparison branches, not one running conversation task. Per-turn creation/expiry clocks are unknown and null; missing retained prompt yields missing state and null instruction. Turn references are read-only scoped identity/sequence/instruction digests and cannot be used with Video writes. Branch phase/output are exact saved conversation content; actual execution references require a current workspace attempt and matching model. Customer charges are hydrated from the existing ledger projection; no saved procurement fields are returned. Chat retention and writes stay under the legacy Chat contract; Video 30-day instruction retention does not apply to this bridge.

**Supported scope:** implemented
