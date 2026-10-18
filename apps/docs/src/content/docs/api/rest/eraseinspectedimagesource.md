---
title: "Erase this API key's retained source bytes"
description: "DELETE /v1/media/image-sources/{id}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /v1/media/image-sources/{id}`

Idempotent and opaque for absent or foreign sources. Immutable provenance remains. Does not cancel an already accepted upstream asset or erase it upstream.

Operation: `eraseInspectedImageSource`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/v1/media/image-sources/{id}" \
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

Scoped source erased or unavailable; no existence disclosure

### HTTP 401

Active API key required

## Behavior and supported scope

Idempotent and opaque for absent or foreign sources. Immutable provenance remains. Does not cancel an already accepted upstream asset or erase it upstream.
