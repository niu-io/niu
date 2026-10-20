---
title: "Associate an API configuration with a Provider"
description: "PUT /api/v1/vendors/{id}/supplier"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/vendors/{id}/supplier`

Installation credential or explicitly granted platform administrator required. Provider membership and customer ownership alone do not grant access. Atomic and audited. The first association requires the current configuration revision. Repeating the same Provider association is idempotent even with the original revision and does not increment it again. A different Provider cannot take over an existing association. Deleted Providers cannot receive configurations. Association and deletion serialize: once ownership commits, deletion returns 409. Does not activate, qualify or price an offer.

Operation: `associateConfigurationProvider`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/vendors/{id}/supplier" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "supplier_id",
    "expected_revision"
  ],
  "properties": {
    "supplier_id": {
      "type": "string",
      "format": "uuid"
    },
    "expected_revision": {
      "type": "integer",
      "format": "int64",
      "description": "Current configuration revision for a first association; ignored on an identical existing association."
    }
  }
}
```

## Responses

### HTTP 204

Association established or already present; no response body.

### HTTP 401

Invalid or missing administrative credential.

### HTTP 403

Installation administration required.

### HTTP 409

Unknown or deleted Provider, unknown configuration, stale first-association revision, conflicting offer ownership or attempted reassignment.

### HTTP 422

Malformed request fields or unknown properties.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Installation credential or explicitly granted platform administrator required. Provider membership and customer ownership alone do not grant access. Atomic and audited. The first association requires the current configuration revision. Repeating the same Provider association is idempotent even with the original revision and does not increment it again. A different Provider cannot take over an existing association. Deleted Providers cannot receive configurations. Association and deletion serialize: once ownership commits, deletion returns 409. Does not activate, qualify or price an offer.

**Supported scope:** implemented
