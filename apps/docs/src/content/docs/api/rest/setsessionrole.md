---
title: "Select an assigned role for the current browser sign-in"
description: "PUT /api/v1/session/role"
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/session/role`

Accepts user or admin only. Available roles, the active role and whether switching is supported come from GET /api/v1/session data.roles. New password sign-ins start as user. Selecting admin requires a current explicit platform grant and activates administration for at most six hours, bounded by session expiry. Selection is persisted and audited on the server; it does not change tenant Owner/Admin/Viewer permissions, grant membership, issue credentials or expand workspace scope. Provider self-service is not currently supported. Explicit automation and installation credentials cannot switch role. Read back session identity after an uncertain response. Cookie requests require the trusted same origin.

Operation: `setSessionRole`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/session/role" \
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
    "role"
  ],
  "properties": {
    "role": {
      "type": "string",
      "enum": [
        "user",
        "admin"
      ]
    }
  }
}
```

## Responses

### HTTP 200

Current session identity with roles.active

### HTTP 400

Invalid JSON.

### HTTP 401

Invalid

### HTTP 403

The requested role is not currently granted or same-origin checks failed.

### HTTP 422

Unsupported role or invalid fields.

### HTTP 503

Authentication storage unavailable.

## Behavior and supported scope

Accepts user or admin only. Available roles, the active role and whether switching is supported come from GET /api/v1/session data.roles. New password sign-ins start as user. Selecting admin requires a current explicit platform grant and activates administration for at most six hours, bounded by session expiry. Selection is persisted and audited on the server; it does not change tenant Owner/Admin/Viewer permissions, grant membership, issue credentials or expand workspace scope. Provider self-service is not currently supported. Explicit automation and installation credentials cannot switch role. Read back session identity after an uncertain response. Cookie requests require the trusted same origin.
