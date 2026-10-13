---
title: "Fetch exact approved image bytes using an expiring capability"
description: "GET /v1/media/sources/{token}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/media/sources/{token}`

Internal Supplier handoff capability, not a customer download API. The secret path token authorizes at most four deliveries within sixty seconds. Current consent, policy, detector configuration and retained content are checked on every fetch. Never log or persist the token URL. Issuance is not exposed by this API. Query parameters, request bodies and range requests are unsupported.

Operation: `fetchInspectedImageSource`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/media/sources/{token}"
```

## Parameters

### token

Location: **path**. **Required.**

```json
{
  "type": "string",
  "pattern": "^nis_[a-f0-9]{64}$"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Exact verified image bytes; Cache-Control no-store, Referrer-Policy no-referrer and X-Content-Type-Options nosniff. No destination credentials are returned.

Content type: `image/png`.

```json
{
  "type": "string",
  "format": "binary"
}
```

Content type: `image/jpeg`.

```json
{
  "type": "string",
  "format": "binary"
}
```

Content type: `image/webp`.

```json
{
  "type": "string",
  "format": "binary"
}
```

### HTTP 400

Unsupported query or request body

### HTTP 404

Opaque unavailable capability or source

### HTTP 405

Only GET is supported

### HTTP 416

Range requests are unsupported

### HTTP 503

Transfer capacity exhausted

Response headers:

```json
{
  "Retry-After": {
    "schema": {
      "type": "integer",
      "const": 1
    }
  }
}
```

## Behavior and supported scope

Internal Supplier handoff capability, not a customer download API. The secret path token authorizes at most four deliveries within sixty seconds. Current consent, policy, detector configuration and retained content are checked on every fetch. Never log or persist the token URL. Issuance is not exposed by this API. Query parameters, request bodies and range requests are unsupported.
