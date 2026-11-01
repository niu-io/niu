---
title: "Compatibility operation to enter or leave Admin mode"
description: "PUT /api/v1/session/mode"
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/session/mode`

Requires an existing password-login session. Entering requires a current explicit platform administrator grant. Browser sign-ins start in User mode. Admin mode is persisted server-side for this session only, expires after at most six hours, and never expands customer workspace scope. Leaving removes platform authority on subsequent requests. The change is audited; it does not grant membership or issue credentials. Installation tokens and explicitly issued automation sessions retain their existing authorization contracts and cannot use this operation. Cookie requests require the trusted same origin. Read GET /api/v1/session to verify or recover an uncertain response; do not replay other management mutations. Responses are not cached.

Operation: `setBrowserAdminMode`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "adminBearerAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/session/mode" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
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
    "enabled"
  ],
  "properties": {
    "enabled": {
      "type": "boolean"
    }
  }
}
```

## Responses

### HTTP 200

Current session identity, admin_mode availability and effective permissions, using the same response shape as GET /api/v1/session.

### HTTP 400

Invalid JSON.

### HTTP 401

Invalid, expired, revoked or unsupported session.

### HTTP 403

Platform administrator eligibility or same-origin authority is missing.

### HTTP 422

Invalid fields or input types.

### HTTP 503

Authentication storage unavailable; read back before retrying.

## Behavior and supported scope

Requires an existing password-login session. Entering requires a current explicit platform administrator grant. Browser sign-ins start in User mode. Admin mode is persisted server-side for this session only, expires after at most six hours, and never expands customer workspace scope. Leaving removes platform authority on subsequent requests. The change is audited; it does not grant membership or issue credentials. Installation tokens and explicitly issued automation sessions retain their existing authorization contracts and cannot use this operation. Cookie requests require the trusted same origin. Read GET /api/v1/session to verify or recover an uncertain response; do not replay other management mutations. Responses are not cached.
