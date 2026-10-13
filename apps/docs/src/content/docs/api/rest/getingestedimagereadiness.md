---
title: "Retrieve one persisted readiness observation without an upstream request"
description: "GET /v1/media/image-ingestions/{id}/readiness/{read_id}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/media/image-ingestions/{id}/readiness/{read_id}`



Operation: `getIngestedImageReadiness`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/media/image-ingestions/{id}/readiness/{read_id}" \
  -H "Authorization: Bearer $NIU_API_KEY"
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

### read_id

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

Customer-safe observation; no upstream identifiers, raw response, credentials or commercial procurement data

### HTTP 401

Active original API key required

### HTTP 404

Observation unavailable under this key and ingestion

## Behavior and supported scope
