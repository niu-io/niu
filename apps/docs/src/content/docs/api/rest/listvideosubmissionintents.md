---
title: "List the current actor video intent index"
description: "GET /api/v1/organizations/{organization}/projects/{project}/video/intents"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/video/intents`

Actor-owned workspace records: installation authority shares one installation actor, while operator actors are isolated even within the same workspace. Current workspace permission applies. Request content is retained for 30 days from creation or until deletion; expiry is unreadable immediately and background maintenance clears retained content. Identity tombstones remain. Deletion does not cancel an already accepted concurrent submission, erase its job or refund charges. Newest-first creation order with UUID tie-breaker. The index contains only intent identity, revision, expiry and retention state; it intentionally exposes no request, model or key content. Index access remains available for deleting retained content after key revocation. Read each intent separately under current key authorization. A cursor must belong to this actor and workspace.

Operation: `listVideoSubmissionIntents`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/video/intents" \
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
  "default": 25
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

List the current actor video intent index

Response headers:

```json
{
  "Cache-Control": {
    "schema": {
      "type": "string",
      "const": "no-store"
    }
  }
}
```

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data",
    "has_more",
    "next_before"
  ],
  "properties": {
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "revision",
          "expires_at_ms",
          "content_state"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "revision": {
            "type": "integer",
            "minimum": 1
          },
          "expires_at_ms": {
            "description": "Immutable original intent deadline. A bound turn may expire or delete content earlier; content_state determines availability.",
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "content_state": {
            "type": "string",
            "enum": [
              "retained",
              "deleted",
              "expired"
            ]
          }
        }
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
  }
}
```

### HTTP 400

Invalid path, query or request; framework rejections may be plain text.

### HTTP 401

Invalid actor credential or no authorized current key in the original lineage.

### HTTP 403

Workspace permission or current source policy denied.

### HTTP 404

Intent is not owned by this actor and workspace, or selected model is inaccessible.

### HTTP 409

Immutable identity, request, funding mode, revision or cursor conflict.

### HTTP 503

Required storage or route configuration is unavailable.

## Behavior and supported scope

Actor-owned workspace records: installation authority shares one installation actor, while operator actors are isolated even within the same workspace. Current workspace permission applies. Request content is retained for 30 days from creation or until deletion; expiry is unreadable immediately and background maintenance clears retained content. Identity tombstones remain. Deletion does not cancel an already accepted concurrent submission, erase its job or refund charges. Newest-first creation order with UUID tie-breaker. The index contains only intent identity, revision, expiry and retention state; it intentionally exposes no request, model or key content. Index access remains available for deleting retained content after key revocation. Read each intent separately under current key authorization. A cursor must belong to this actor and workspace.

**Supported scope:** implemented

**Supported scope:** Durable text and typed Niu material-reference intent persistence with explicit submission. URL, inline data and ingested-image intent drafts remain unsupported; full browser restoration and customer-funded video qualification remain separate.
