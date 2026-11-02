---
title: "Inspect captured quote versions and recover uncertain refreshes"
description: "GET /api/v1/providers/{provider}/pricing/history"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/providers/{provider}/pricing/history`

Platform administration required. Newest-first immutable version summaries, at most 50 per page, without full quote payloads. after is an exclusive revision cursor. Read a chosen revision to inspect original evidence; no source fetch or mutation is performed.

Operation: `listProviderPriceHistory`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/providers/{provider}/pricing/history" \
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

### after

Location: **query**. Optional.

```json
{
  "type": "integer",
  "format": "int64",
  "minimum": 1
}
```

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 50,
  "default": 20
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Quote version summaries and optional next_after cursor.

## Behavior and supported scope

Platform administration required. Newest-first immutable version summaries, at most 50 per page, without full quote payloads. after is an exclusive revision cursor. Read a chosen revision to inspect original evidence; no source fetch or mutation is performed.

**Supported scope:** implemented
