---
title: "Delete a saved workspace material"
description: "DELETE /api/v1/organizations/{organization}/projects/{project}/assets/{asset}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /api/v1/organizations/{organization}/projects/{project}/assets/{asset}`

Member Write permission required. Optional expected_revision protects against deleting a newly renamed active object. Deletion marks metadata inactive, erases ciphertext and releases quota atomically. Repeat deletion of the same scoped deleted asset is idempotent 204. Unknown or foreign asset is 404. No upstream asset or existing inference job is deleted.

Operation: `deleteWorkspaceAsset`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/assets/{asset}" \
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

### expected_revision

Location: **query**. Optional. Optional canonical positive i64 revision of the active asset.

```json
{
  "type": "string",
  "pattern": "^[1-9][0-9]*$"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 204

Scoped deletion committed or already deleted; no response body.

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

Member Write permission required. Optional expected_revision protects against deleting a newly renamed active object. Deletion marks metadata inactive, erases ciphertext and releases quota atomically. Repeat deletion of the same scoped deleted asset is idempotent 204. Unknown or foreign asset is 404. No upstream asset or existing inference job is deleted.

**Supported scope:** implemented
