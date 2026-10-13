---
title: "Revoke source publication consent without erasing immutable history"
description: "DELETE /v1/media/image-ingestions/{id}"
tableOfContents: false
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
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X DELETE "$NIU_ORIGIN/v1/media/image-ingestions/{id}" \
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

### HTTP 204

Consent revoked or already revoked

### HTTP 401

Active API key required

### HTTP 404

Consent unavailable under this API key

## Behavior and supported scope

Idempotent for the original API key. Revocation does not cancel an upload already accepted upstream or resolve an uncertain outcome.
