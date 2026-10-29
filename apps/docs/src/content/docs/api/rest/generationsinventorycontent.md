---
title: "Download an authorized retained output"
description: "GET /api/v1/organizations/{organization}/projects/{project}/generations/artifacts/{task}/{kind}/content"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/generations/artifacts/{task}/{kind}/content`

Current dashboard workspace Read authorizes saved history even when its inference key is revoked, expired, or its model grants changed. No active key secret is needed. Actor-private session/intent tasks belonging to another actor are excluded. API-created tasks without a private association are workspace-readable. No prompt, upstream URL, asset URI, credential or procurement field is returned. This GET never dispatches, refreshes, retries or settles inference. Task pages use immutable created_at/id DESC; artifacts use immutable output created_at/task_id/kind DESC. A cursor resolves in current authorized workspace independently of mutable state filters; malformed, missing or out-of-scope cursor is 400. Changing filters starts a new live view. No partial successful empty result: storage errors return 503. Artifact reference availability is retention evidence, not a guarantee the upstream bytes still exist. Content delivery performs only bounded result retrieval, rechecking dashboard access and retention after download. Content remains explicitly refused with 409 if its original Provider account/model binding is no longer current; historical read access never restores routing or credential authority. Existing key-scoped APIs and explicit refresh authorization remain unchanged. Chat stays in typed saved sessions; only Video execution inventory is supported.

Operation: `generationsInventoryContent`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/generations/artifacts/{task}/{kind}/content" \
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

Saved projection; complete true means this supported Video inventory read completed, not all task kinds.

Content type: `application/octet-stream`.

```json
{
  "type": "string",
  "format": "binary"
}
```

### HTTP 400

Invalid query, unsupported kind or inaccessible cursor

### HTTP 401

Session invalid or expired

### HTTP 403

Current workspace permission denied

### HTTP 404

Record missing or actor-inaccessible

### HTTP 409

Original Provider delivery binding is no longer current; metadata history remains readable.

### HTTP 503

Saved read unavailable; never presented as empty inventory

## Behavior and supported scope

Current dashboard workspace Read authorizes saved history even when its inference key is revoked, expired, or its model grants changed. No active key secret is needed. Actor-private session/intent tasks belonging to another actor are excluded. API-created tasks without a private association are workspace-readable. No prompt, upstream URL, asset URI, credential or procurement field is returned. This GET never dispatches, refreshes, retries or settles inference. Task pages use immutable created_at/id DESC; artifacts use immutable output created_at/task_id/kind DESC. A cursor resolves in current authorized workspace independently of mutable state filters; malformed, missing or out-of-scope cursor is 400. Changing filters starts a new live view. No partial successful empty result: storage errors return 503. Artifact reference availability is retention evidence, not a guarantee the upstream bytes still exist. Content delivery performs only bounded result retrieval, rechecking dashboard access and retention after download. Content remains explicitly refused with 409 if its original Provider account/model binding is no longer current; historical read access never restores routing or credential authority. Existing key-scoped APIs and explicit refresh authorization remain unchanged. Chat stays in typed saved sessions; only Video execution inventory is supported.

**Supported scope:** implemented
