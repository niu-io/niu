---
title: "Retrieve fresh output from the original Video task"
description: "POST /admin/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}/results/{kind}/refresh"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}/results/{kind}/refresh`

Explicit workspace Write action. Derives the original inference key and immutable Provider/account/model/channel binding from the actor-visible saved task; clients cannot choose replacements. Current original key grants and source policy remain required; revoked or expired keys never regain action authority through history. No generation, automatic retry or composer configuration is used. Rechecks actor visibility and grants after upstream work. Saved GET, cached artifact content, upstream refresh and fresh delivery remain distinct. Queries the original task once, then performs bounded authorized binary retrieval. Does not rewrite expired/deleted cached references. A fresh URL does not prove durable media availability; missing result404, supplier gone/unavailable502 and timeout504 remain explicit.

Operation: `retrieveFreshGenerationsTaskResult`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}/results/{kind}/refresh" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
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

Bounded media bytes

Content type: `video/mp4`.

```json
{
  "type": "string",
  "format": "binary"
}
```

Content type: `video/webm`.

```json
{
  "type": "string",
  "format": "binary"
}
```

Content type: `image/png`.

```json
{
  "type": "string",
  "format": "binary"
}
```

Content type: `image/jpeg`.

```json
{
  "type": "string",
  "format": "binary"
}
```

### HTTP 400

Invalid kind or request

### HTTP 401

Sign-in required

### HTTP 403

Workspace Write or original-key permission denied

### HTTP 404

Task missing, actor-private, or original key no longer available

### HTTP 409

Original Provider binding changed or query already claimed

### HTTP 502

Upstream query or result delivery failed

### HTTP 503

Storage or bounded delivery unavailable

### HTTP 504

Upstream query or delivery timed out

## Behavior and supported scope

Explicit workspace Write action. Derives the original inference key and immutable Provider/account/model/channel binding from the actor-visible saved task; clients cannot choose replacements. Current original key grants and source policy remain required; revoked or expired keys never regain action authority through history. No generation, automatic retry or composer configuration is used. Rechecks actor visibility and grants after upstream work. Saved GET, cached artifact content, upstream refresh and fresh delivery remain distinct. Queries the original task once, then performs bounded authorized binary retrieval. Does not rewrite expired/deleted cached references. A fresh URL does not prove durable media availability; missing result404, supplier gone/unavailable502 and timeout504 remain explicit.

**Supported scope:** implemented
