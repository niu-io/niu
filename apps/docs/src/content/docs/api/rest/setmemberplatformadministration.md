---
title: "Explicitly grant or revoke platform administrator eligibility"
description: "PUT /api/v1/operators/{operator}/administration"
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/operators/{operator}/administration`

Requires an installation credential and the expected current eligibility. Records changed grants in immutable platform_admin_events and clears all retained browser activations for the affected member. Granting does not enter Admin mode, change passwords, issue credentials or expand customer workspace scope. A matching no-op creates no audit event. Read this resource and GET /api/v1/session to verify grant and effective activation separately. A conflict requires readback before reconsidering the change. Responses are not cached.

Operation: `setMemberPlatformAdministration`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/operators/{operator}/administration" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### operator

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "enabled",
    "expected_enabled"
  ],
  "properties": {
    "enabled": {
      "type": "boolean"
    },
    "expected_enabled": {
      "type": "boolean"
    }
  }
}
```

## Responses

### HTTP 200

Explicit eligibility saved. Response data.enabled is the saved boolean.

### HTTP 401

Missing or invalid credential.

### HTTP 403

Installation credential required.

### HTTP 409

Eligibility changed concurrently or member missing/revoked. Read back before retrying.

### HTTP 503

Storage unavailable. Read back an uncertain result.

## Behavior and supported scope

Requires an installation credential and the expected current eligibility. Records changed grants in immutable platform_admin_events and clears all retained browser activations for the affected member. Granting does not enter Admin mode, change passwords, issue credentials or expand customer workspace scope. A matching no-op creates no audit event. Read this resource and GET /api/v1/session to verify grant and effective activation separately. A conflict requires readback before reconsidering the change. Responses are not cached.
