---
title: "Get authenticated upstream verification link"
description: "GET /v1/media/verifications/{id}/link"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/media/verifications/{id}/link`

Current workspace API key, model grant, composed workspace/key model and Provider policy, eligible published route and selectable credential required. Original immutable account/model binding is revalidated; original key identity binds encryption only, not workspace access control. Only configured fastrouter-actions-v1 channels are supported. Explicit authenticated disclosure of the genuine external H5 URL to the current authorized workspace. Known expiry is checked before disclosure; absent upstream expiry is not replaced with invented entitlement. Only waiting/processing sessions expose a link. No raw BytedToken field, anonymous NIU link or local biometric processing. Cache-Control no-store and Referrer-Policy no-referrer.

Operation: `getMediaVerificationLink`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/media/verifications/{id}/link" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  --url-query 'model=<MODEL>'
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/media/verifications/{id}/link" \
  -H "X-Niu-API-Key: $NIU_API_KEY" \
  --url-query 'model=<MODEL>'
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

### model

Location: **query**. **Required.**

```json
{
  "type": "string"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Authorized upstream H5 handoff

Response headers:

```json
{
  "Cache-Control": {
    "schema": {
      "type": "string",
      "const": "no-store"
    }
  },
  "Referrer-Policy": {
    "schema": {
      "type": "string",
      "const": "no-referrer"
    }
  }
}
```

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "verification_url",
    "expires_at"
  ],
  "properties": {
    "verification_url": {
      "type": "string",
      "format": "uri"
    },
    "expires_at": {
      "type": [
        "string",
        "null"
      ],
      "format": "date-time"
    }
  }
}
```

### HTTP 400

Invalid fields or query

### HTTP 401

Missing, revoked or expired API key

### HTTP 403

Workspace/key policy refusal

### HTTP 404

Owned session or model not found

### HTTP 409

Changed input, stale route, expiry, unavailable token or capacity conflict

### HTTP 413

Body exceeds bounded size

### HTTP 501

Selected channel does not configure verification management

### HTTP 503

Credential, encrypted content or bounded storage unavailable

## Behavior and supported scope

Current workspace API key, model grant, composed workspace/key model and Provider policy, eligible published route and selectable credential required. Original immutable account/model binding is revalidated; original key identity binds encryption only, not workspace access control. Only configured fastrouter-actions-v1 channels are supported. Explicit authenticated disclosure of the genuine external H5 URL to the current authorized workspace. Known expiry is checked before disclosure; absent upstream expiry is not replaced with invented entitlement. Only waiting/processing sessions expose a link. No raw BytedToken field, anonymous NIU link or local biometric processing. Cache-Control no-store and Referrer-Policy no-referrer.

**Supported scope:** implemented
