---
title: "List saved workspace materials"
description: "GET /api/v1/organizations/{organization}/projects/{project}/assets"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/assets`

Member Read permission required. Scope is the selected workspace, not the creating actor. Lists active objects with metadata only, ordered by creation time then identity. limit defaults to 50 and must be 1–100. after must be an active asset in the same workspace and kind filter or conflicts. Follow next_cursor; separate pages are not a frozen snapshot. No ciphertext, actor identifier, Provider URI, procurement or dispatch approval is returned.

Operation: `listWorkspaceAssets`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/assets" \
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

### kind

Location: **query**. Optional.

```json
{
  "type": "string",
  "enum": [
    "image",
    "video",
    "audio"
  ]
}
```

### after

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
  "default": 50
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
    "data",
    "next_cursor"
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
    },
    "next_cursor": {
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

Member Read permission required. Scope is the selected workspace, not the creating actor. Lists active objects with metadata only, ordered by creation time then identity. limit defaults to 50 and must be 1–100. after must be an active asset in the same workspace and kind filter or conflicts. Follow next_cursor; separate pages are not a frozen snapshot. No ciphertext, actor identifier, Provider URI, procurement or dispatch approval is returned.

**Supported scope:** implemented
