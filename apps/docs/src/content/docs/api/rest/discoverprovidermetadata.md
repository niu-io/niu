---
title: "Read normalized metadata through a Provider credential"
description: "GET /api/v1/providers/{provider}/metadata"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/providers/{provider}/metadata`

Platform administration required. credential selects one saved connection owned by this Provider; no key values are returned. Reuses bounded authenticated catalog discovery and explicit inherited service identity. Catalog access does not verify inference or publish models/prices.

Operation: `discoverProviderMetadata`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/providers/{provider}/metadata" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  --url-query 'credential=<CREDENTIAL>'
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

### credential

Location: **query**. **Required.**

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

Normalized model metadata, price evidence when present, and discovery scope.

### HTTP 404

Provider/credential binding unavailable.

## Behavior and supported scope

Platform administration required. credential selects one saved connection owned by this Provider; no key values are returned. Reuses bounded authenticated catalog discovery and explicit inherited service identity. Catalog access does not verify inference or publish models/prices.

**Supported scope:** implemented
