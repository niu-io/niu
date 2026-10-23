---
title: "Rename a saved workspace material"
description: "PATCH /api/v1/organizations/{organization}/projects/{project}/assets/{asset}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PATCH /api/v1/organizations/{organization}/projects/{project}/assets/{asset}`

Member Write permission required. Requires the exact current revision as a canonical positive decimal string. Renaming changes display metadata and increments revision, never bytes, content hash or Provider authorization. Stale revision returns 409. A missing scoped asset is 404; a concurrent deletion may conflict.

Operation: `renameWorkspaceAsset`.

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
curl --fail-with-body -X PATCH "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/assets/{asset}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
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

### asset

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
    "name",
    "expected_revision"
  ],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200,
      "description": "Trimmed display name, at most 200 UTF-8 bytes, without control characters."
    },
    "expected_revision": {
      "type": "string",
      "pattern": "^[1-9][0-9]*$",
      "description": "Canonical positive signed-64-bit integer; use for rename/delete concurrency checks."
    }
  }
}
```

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
        },
        "source": {
          "type": [
            "object",
            "null"
          ],
          "description": "Authorized original generation context. Null when absent or not visible to this actor; sharing a retained copy does not grant source access.",
          "additionalProperties": false,
          "required": [
            "reference",
            "kind",
            "output",
            "model",
            "created_at"
          ],
          "properties": {
            "reference": {
              "type": "string",
              "pattern": "^run-[1-9][0-9]{0,18}$"
            },
            "kind": {
              "const": "video"
            },
            "output": {
              "enum": [
                "video",
                "last_frame"
              ]
            },
            "model": {
              "type": "string"
            },
            "created_at": {
              "type": "string",
              "format": "date-time"
            }
          }
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

Member Write permission required. Requires the exact current revision as a canonical positive decimal string. Renaming changes display metadata and increments revision, never bytes, content hash or Provider authorization. Stale revision returns 409. A missing scoped asset is 404; a concurrent deletion may conflict.

**Supported scope:** implemented
