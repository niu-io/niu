---
title: "Read an immutable Provider quote version"
description: "GET /api/v1/providers/{provider}/pricing/{revision}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/providers/{provider}/pricing/{revision}`

Platform administration required. Returns original source evidence without fetching or repricing. A version from another Provider is unavailable. Historical versions remain readable after a later adapter change.

Operation: `getProviderPriceEvidence`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/providers/{provider}/pricing/{revision}" \
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

### revision

Location: **path**. **Required.**

```json
{
  "type": "integer",
  "format": "int64",
  "minimum": 1
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Original quote evidence and source identity.

### HTTP 404

Version unavailable under this Provider.

## Behavior and supported scope

Platform administration required. Returns original source evidence without fetching or repricing. A version from another Provider is unavailable. Historical versions remain readable after a later adapter change.

**Supported scope:** implemented
