---
title: "Read customer-safe ingestion status under the original API key"
description: "GET /v1/media/image-ingestions/{id}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/media/image-ingestions/{id}`



Operation: `getImageIngestionConsent`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/media/image-ingestions/{id}" \
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

## Request body

No request body is declared.

## Responses

### HTTP 200

Consent status with nullable allowlisted reason, duration_ms and observed_at from its immutable outcome; no credentials, source tokens, upstream identifiers or procurement data

### HTTP 401

Active API key required

### HTTP 404

Consent unavailable under this API key

## Behavior and supported scope
