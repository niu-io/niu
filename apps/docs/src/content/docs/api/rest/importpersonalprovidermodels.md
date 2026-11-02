---
title: "Discover and import owner-funded Provider models"
description: "POST /api/v1/vendors/{id}/import"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/vendors/{id}/import`

Platform administration required. Reads the bounded upstream catalog, then atomically creates missing private model mappings for the saved personal owner. Existing mappings, disabled choices, prices and grants are preserved. No inference or payment is performed. Catalog access is not inference verification. Credential revision conflicts abort the import; retry is safe and adds only missing upstream IDs.

Operation: `importPersonalProviderModels`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/vendors/{id}/import" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

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

Import counts and discovery evidence.

### HTTP 400

Not a personal connection or unsupported catalog identifiers.

### HTTP 409

Connection changed or an alias conflicts; no models imported.

### HTTP 502

Upstream catalog read failed; saved connection is retained.

## Behavior and supported scope

Platform administration required. Reads the bounded upstream catalog, then atomically creates missing private model mappings for the saved personal owner. Existing mappings, disabled choices, prices and grants are preserved. No inference or payment is performed. Catalog access is not inference verification. Credential revision conflicts abort the import; retry is safe and adds only missing upstream IDs.

**Supported scope:** implemented
