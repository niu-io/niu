---
title: "List personal saved Chat history or one continuation page"
description: "GET /api/v1/workspaces/{workspace}/chats"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/workspaces/{workspace}/chats`

Without limit or after, retain the latest-100 compatibility response. Either paging parameter selects a bounded page, default 50, ordered by updated time and ID descending within the authenticated owner, workspace and archive state. Session payload and customer-charge hydration share a read-only snapshot with 250 ms lock and 2 s statement limits. A changed, deleted, foreign-owner or different-archive cursor returns 409; pages are live views, not a frozen cross-request snapshot. Before loading saved bodies, paging also limits the sum of saved JSON text bytes to 32 MiB and may return fewer rows than limit; follow next_cursor. Customer-charge hydration can increase wire size. Legacy latest-100 calls over that saved-payload budget return 413 rather than truncated success. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

Operation: `listChatSessionsByWorkspace`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/workspaces/{workspace}/chats" \
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

### archived

Location: **query**. Optional.

```json
{
  "type": "boolean",
  "default": false
}
```

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 50
}
```

### after

Location: **query**. Optional. Opaque next_cursor from the previous page; do not interpret or display it.

```json
{
  "type": "string",
  "pattern": "^[0-9a-fA-F-]{36}:[0-9a-fA-F]{64}$"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Compatibility data array or paged data array with nullable next_cursor.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object"
      }
    },
    "next_cursor": {
      "type": [
        "string",
        "null"
      ]
    }
  }
}
```

### HTTP 400

Malformed cursor or invalid page size.

### HTTP 401

Authentication required.

### HTTP 403

Workspace read access required.

### HTTP 404

Resource missing or outside authorized workspace/owner scope.

### HTTP 409

Cursor no longer matches an accessible session in this archive.

### HTTP 413

Saved Chat history exceeds one-response capacity; use paging or individual conversation export.

### HTTP 503

Storage unavailable or read wait exceeded; no empty-success fallback.

## Behavior and supported scope

Without limit or after, retain the latest-100 compatibility response. Either paging parameter selects a bounded page, default 50, ordered by updated time and ID descending within the authenticated owner, workspace and archive state. Session payload and customer-charge hydration share a read-only snapshot with 250 ms lock and 2 s statement limits. A changed, deleted, foreign-owner or different-archive cursor returns 409; pages are live views, not a frozen cross-request snapshot. Before loading saved bodies, paging also limits the sum of saved JSON text bytes to 32 MiB and may return fewer rows than limit; follow next_cursor. Customer-charge hydration can increase wire size. Legacy latest-100 calls over that saved-payload budget return 413 rather than truncated success. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

**Supported scope:** implemented
