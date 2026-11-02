---
title: "Link an issued operator access token to the current member account"
description: "POST /api/v1/session/memberships"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/session/memberships`

Requires an authenticated member session and a valid, unrevoked operator session token. Links the target operator membership to the caller's account identity with explicit token proof, switches the current session to that membership, and returns the updated session identity. Rejects tokens already linked to a different account identity with 409.

Operation: `claimSessionMembership`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/session/memberships" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

No path, query, or header parameters are declared.

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "token"
  ],
  "properties": {
    "token": {
      "type": "string",
      "minLength": 1,
      "description": "Issued operator access token."
    }
  }
}
```

## Responses

### HTTP 200

Membership linked and active session switched.

### HTTP 400

Invalid or expired invite token.

### HTTP 401

Invalid, expired or revoked member session.

### HTTP 403

Installation credentials cannot claim member memberships.

### HTTP 409

The operator membership is already linked to a different account identity.

## Behavior and supported scope

Requires an authenticated member session and a valid, unrevoked operator session token. Links the target operator membership to the caller's account identity with explicit token proof, switches the current session to that membership, and returns the updated session identity. Rejects tokens already linked to a different account identity with 409.

**Supported scope:** implemented
