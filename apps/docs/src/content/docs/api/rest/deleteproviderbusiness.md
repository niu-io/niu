---
title: "Remove an unconfigured Provider from the directory"
description: "DELETE /api/v1/providers/{provider}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /api/v1/providers/{provider}`

Platform administration required. Soft-deletes only a live Provider with no owned API configurations, offers or memberships; disabled configurations and inactive memberships still count as dependencies. Audit history is retained. Concurrent configuration association serializes with deletion. This is not a credential revocation or financial-history deletion operation. Repeating deletion returns 409.

Operation: `deleteProviderBusiness`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/api/v1/providers/{provider}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### provider

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### provider

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

Provider removed from the active directory.

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
      "required": [
        "deleted"
      ],
      "properties": {
        "deleted": {
          "type": "boolean",
          "const": true
        }
      }
    }
  }
}
```

### HTTP 401

Missing or invalid administrative credential.

### HTTP 403

Platform administration required.

### HTTP 409

Unknown or already deleted Provider, or existing configuration, offer or membership dependency.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Platform administration required. Soft-deletes only a live Provider with no owned API configurations, offers or memberships; disabled configurations and inactive memberships still count as dependencies. Audit history is retained. Concurrent configuration association serializes with deletion. This is not a credential revocation or financial-history deletion operation. Repeating deletion returns 409.

**Supported scope:** implemented
