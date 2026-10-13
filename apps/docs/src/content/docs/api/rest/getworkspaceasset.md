---
title: "Read workspace material metadata"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/assets/{asset}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/assets/{asset}`

Member Read permission required. Returns one active scoped asset without ciphertext or internal actor information. Unknown, deleted or foreign-workspace asset is 404.

Operation: `getWorkspaceAsset`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/assets/{asset}" \
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

Scoped asset metadata; no private ciphertext or actor identifier.

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
        "name",
        "media_kind",
        "content_type",
        "content_sha256",
        "byte_length",
        "revision",
        "created_at_ms",
        "updated_at_ms"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid",
          "description": "Internal routing reference; never display as a user label."
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200,
          "description": "Trimmed display name, at most 200 UTF-8 bytes, without control characters."
        },
        "media_kind": {
          "type": "string",
          "enum": [
            "image",
            "video",
            "audio"
          ]
        },
        "content_type": {
          "type": "string",
          "enum": [
            "image/png",
            "image/jpeg",
            "image/webp",
            "video/mp4",
            "video/webm",
            "audio/wav",
            "audio/mpeg",
            "audio/ogg"
          ]
        },
        "content_sha256": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$",
          "description": "SHA-256 of the immutable original bytes."
        },
        "byte_length": {
          "type": "integer",
          "minimum": 1,
          "maximum": 8388608
        },
        "revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$",
          "description": "Canonical positive signed-64-bit integer; use for rename/delete concurrency checks."
        },
        "created_at_ms": {
          "type": "integer",
          "format": "int64"
        },
        "updated_at_ms": {
          "type": "integer",
          "format": "int64"
        }
      }
    }
  }
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

Member Read permission required. Returns one active scoped asset without ciphertext or internal actor information. Unknown, deleted or foreign-workspace asset is 404.

**Supported scope:** implemented
