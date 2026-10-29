---
title: "Revoke source publication consent without erasing immutable history"
description: "DELETE /v1/media/image-ingestions/{id}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /v1/media/image-ingestions/{id}`

Idempotent for the original API key. Revocation does not cancel an upload already accepted upstream or resolve an uncertain outcome.

Operation: `revokeImageIngestionConsent`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/v1/media/image-ingestions/{id}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X DELETE "$NIU_ORIGIN/v1/media/image-ingestions/{id}" \
  -H "X-Niu-API-Key: $NIU_API_KEY"
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

### HTTP 204

Consent revoked or already revoked

### HTTP 401

Active API key required

### HTTP 404

Consent unavailable under this API key

## Behavior and supported scope

Idempotent for the original API key. Revocation does not cancel an upload already accepted upstream or resolve an uncertain outcome.
