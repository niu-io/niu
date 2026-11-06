---
title: "Revoke a Provider offer authorization"
description: "DELETE /api/v1/providers/{provider}/offers/{offer}/authorization/{authorization}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /api/v1/providers/{provider}/offers/{offer}/authorization/{authorization}`

Platform administration required. Revokes the specified authorization and pauses the offer if it is still current. Historical attempts and records remain unchanged. Repeating the same revocation is safe. This does not revoke a different current authorization.

Operation: `revokeProviderOfferAuthorization`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/api/v1/providers/{provider}/offers/{offer}/authorization/{authorization}" \
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

### offer

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### authorization

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

Authorization revoked

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "required": [
        "revoked"
      ],
      "properties": {
        "revoked": {
          "type": "boolean"
        }
      }
    }
  }
}
```

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 409

Authorization does not match this Provider and offer

## Behavior and supported scope

Platform administration required. Revokes the specified authorization and pauses the offer if it is still current. Historical attempts and records remain unchanged. Repeating the same revocation is safe. This does not revoke a different current authorization.

**Supported scope:** implemented
