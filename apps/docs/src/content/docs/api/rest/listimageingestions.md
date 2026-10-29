---
title: "Recover this API key's saved ingestion history"
description: "GET /v1/media/image-ingestions"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/media/image-ingestions`

Returns at most fifty newest records ordered by consent creation time and identity. Follow next_cursor as before until null. History includes revoked, expired and completed records without changing consent, publishing source capabilities or contacting an upstream service. A cursor from another key is unavailable. Later inserts do not shift continuation pages.

Operation: `listImageIngestions`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  },
  {
    "niuApiKeyAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

Authentication alternative: `bearerAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/media/image-ingestions" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/media/image-ingestions" \
  -H "X-Niu-API-Key: $NIU_API_KEY"
```

## Parameters

### before

Location: **query**. Optional.

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

Customer-safe status array in data and nullable next_cursor; same safe fields as individual status

### HTTP 400

Invalid cursor or query

### HTTP 401

Active original API key required

### HTTP 404

Cursor unavailable under this key

## Behavior and supported scope

Returns at most fifty newest records ordered by consent creation time and identity. Follow next_cursor as before until null. History includes revoked, expired and completed records without changing consent, publishing source capabilities or contacting an upstream service. A cursor from another key is unavailable. Later inserts do not shift continuation pages.
