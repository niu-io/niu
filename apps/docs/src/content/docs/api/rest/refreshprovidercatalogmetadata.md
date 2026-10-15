---
title: "Refresh descriptive metadata for existing vendor model mappings"
description: "POST /api/v1/vendors/{id}/catalog"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/vendors/{id}/catalog`

Fetches the bounded provider catalog and updates matching upstream IDs only. Preserves aliases, routing, capability declarations and billing prices. Increments revisions when metadata changes. Missing provider models are retained. Requires installation administration or an explicitly granted platform administrator.

Operation: `refreshProviderCatalogMetadata`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/vendors/{id}/catalog" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
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

Number of updated mappings.

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "updated": {
      "type": "integer",
      "minimum": 0
    }
  },
  "required": [
    "updated"
  ]
}
```

### HTTP 401

Invalid or expired administrative credential.

### HTTP 403

Platform administration permission required.

### HTTP 404

Vendor does not exist.

### HTTP 409

Configuration changed during catalog retrieval; no metadata was updated. Retry against the current configuration.

### HTTP 502

Provider catalog unavailable or invalid.

## Behavior and supported scope

Fetches the bounded provider catalog and updates matching upstream IDs only. Preserves aliases, routing, capability declarations and billing prices. Increments revisions when metadata changes. Missing provider models are retained. Requires installation administration or an explicitly granted platform administrator.

**Supported scope:** implemented
