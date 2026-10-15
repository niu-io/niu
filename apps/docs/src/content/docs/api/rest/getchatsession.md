---
title: "Read one complete owned saved Chat conversation"
description: "GET /api/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}`

Requires workspace read permission and the authenticated personal owner. Returns the full saved conversation and archive state without scanning history pages, including sessions beyond the recent-100 list. Selection and authoritative customer-charge hydration share a bounded read-only snapshot (250 ms lock and 2 s statement limits); preceding authorization and pool acquisition are separate. Saved browser accounting is ignored. Saved JSON above 32 MiB returns 413; no content is truncated. Archived sessions remain directly readable.

Operation: `getChatSession`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
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

### id

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

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

### id

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Complete owned conversation and separate archive state.

Response headers:

```json
{
  "Cache-Control": {
    "description": "Complete personal conversation responses must not be cached.",
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
    "data",
    "archived",
    "revision",
    "guardedWrites"
  ],
  "properties": {
    "data": {
      "type": "object"
    },
    "archived": {
      "type": "boolean"
    },
    "revision": {
      "type": "string",
      "pattern": "^[1-9][0-9]*$",
      "description": "Opaque positive decimal write revision. Pass as expectedRevision for guarded saves."
    },
    "guardedWrites": {
      "type": "boolean",
      "description": "True after guarded content save. Version-free saves are then rejected; this mode cannot be disabled by a content save."
    }
  }
}
```

### HTTP 401

Authentication required.

### HTTP 403

Workspace read permission required.

### HTTP 404

No conversation for this personal owner and workspace.

### HTTP 413

Saved JSON exceeds one-response capacity; use individual content export.

### HTTP 503

Durable storage unavailable or read wait exceeded.

## Behavior and supported scope

Requires workspace read permission and the authenticated personal owner. Returns the full saved conversation and archive state without scanning history pages, including sessions beyond the recent-100 list. Selection and authoritative customer-charge hydration share a bounded read-only snapshot (250 ms lock and 2 s statement limits); preceding authorization and pool acquisition are separate. Saved browser accounting is ignored. Saved JSON above 32 MiB returns 413; no content is truncated. Archived sessions remain directly readable.

**Supported scope:** implemented
