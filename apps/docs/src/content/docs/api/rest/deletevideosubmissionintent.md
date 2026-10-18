---
title: "Erase saved intent content without cancelling its job"
description: "DELETE /api/v1/organizations/{organization}/projects/{project}/video-intents/{intent}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /api/v1/organizations/{organization}/projects/{project}/video-intents/{intent}`

Actor-owned workspace records: installation authority shares one installation actor, while operator actors are isolated even within the same workspace. Current workspace permission applies. Request content is retained for 30 days from creation or until deletion; expiry is unreadable immediately and background maintenance clears retained content. Identity tombstones remain. Deletion does not cancel an already accepted concurrent submission, erase its job or refund charges. Requires write permission and the expected revision. Replaying the same successful deletion is idempotent. Does not require an active selected key. Deleted identities cannot be saved or submitted again.

Operation: `deleteVideoSubmissionIntent`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/video-intents/{intent}" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN" \
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

### intent

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
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
    "expected_revision"
  ],
  "properties": {
    "expected_revision": {
      "type": "integer",
      "minimum": 1
    }
  }
}
```

## Responses

### HTTP 200

Erase saved intent content without cancelling its job

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
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "revision",
        "deleted"
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
        "deleted": {
          "const": true
        }
      }
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

Actor-owned workspace records: installation authority shares one installation actor, while operator actors are isolated even within the same workspace. Current workspace permission applies. Request content is retained for 30 days from creation or until deletion; expiry is unreadable immediately and background maintenance clears retained content. Identity tombstones remain. Deletion does not cancel an already accepted concurrent submission, erase its job or refund charges. Requires write permission and the expected revision. Replaying the same successful deletion is idempotent. Does not require an active selected key. Deleted identities cannot be saved or submitted again.

**Supported scope:** implemented

**Supported scope:** Durable text and typed Niu material-reference intent persistence with explicit submission. URL, inline data and ingested-image intent drafts remain unsupported; full browser restoration and customer-funded video qualification remain separate.
