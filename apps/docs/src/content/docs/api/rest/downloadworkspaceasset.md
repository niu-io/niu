---
title: "Download saved workspace material bytes"
description: "GET /api/v1/organizations/{organization}/projects/{project}/assets/{asset}/content"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/assets/{asset}/content`

Member Read permission required. Authenticates encrypted identity binding and checks byte length and SHA-256 before returning the original bytes. Safe fixed attachment filename, exact supported Content-Type, Cache-Control:no-store and X-Content-Type-Options:nosniff. Unknown/deleted/foreign asset is 404; decryption/integrity failure is a safe unavailable response. Does not make content approved for Provider processing.

Operation: `downloadWorkspaceAsset`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/assets/{asset}/content" \
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

### asset

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

Exact retained bytes with no-store/nosniff and safe attachment disposition.

Content type: `image/png`.

```json
{
  "type": "string",
  "format": "binary",
  "maxLength": 8388608
}
```

Content type: `image/jpeg`.

```json
{
  "type": "string",
  "format": "binary",
  "maxLength": 8388608
}
```

Content type: `image/webp`.

```json
{
  "type": "string",
  "format": "binary",
  "maxLength": 8388608
}
```

Content type: `video/mp4`.

```json
{
  "type": "string",
  "format": "binary",
  "maxLength": 8388608
}
```

Content type: `video/webm`.

```json
{
  "type": "string",
  "format": "binary",
  "maxLength": 8388608
}
```

Content type: `audio/wav`.

```json
{
  "type": "string",
  "format": "binary",
  "maxLength": 8388608
}
```

Content type: `audio/mpeg`.

```json
{
  "type": "string",
  "format": "binary",
  "maxLength": 8388608
}
```

Content type: `audio/ogg`.

```json
{
  "type": "string",
  "format": "binary",
  "maxLength": 8388608
}
```

### HTTP 400

Malformed query/body, unsupported type, invalid media bytes, name, page size or revision.

### HTTP 401

Missing/invalid member administrator authentication; inference keys do not manage materials.

### HTTP 403

Authenticated principal lacks workspace scope or required Read/Write permission.

### HTTP 404

Workspace or scoped active asset not found.

### HTTP 409

Stale revision, unavailable cursor or serialized workspace quota exceeded.

### HTTP 503

Bounded processing capacity, encryption or storage unavailable; no successful write is confirmed.

## Behavior and supported scope

Member Read permission required. Authenticates encrypted identity binding and checks byte length and SHA-256 before returning the original bytes. Safe fixed attachment filename, exact supported Content-Type, Cache-Control:no-store and X-Content-Type-Options:nosniff. Unknown/deleted/foreign asset is 404; decryption/integrity failure is a safe unavailable response. Does not make content approved for Provider processing.

**Supported scope:** implemented
