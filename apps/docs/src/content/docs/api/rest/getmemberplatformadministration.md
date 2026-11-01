---
title: "Read an explicit platform administrator grant"
description: "GET /api/v1/operators/{operator}/administration"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/operators/{operator}/administration`

Requires an installation credential. Tenant owners and activated platform administrators cannot inspect or manage these grants. Returns current eligibility for a non-revoked member, independently of browser session mode. Contains no credentials. Responses are not cached.

Operation: `getMemberPlatformAdministration`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/operators/{operator}/administration" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
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

No request body is declared.

## Responses

### HTTP 200

Current explicit eligibility.

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
        "enabled"
      ],
      "properties": {
        "enabled": {
          "type": "boolean"
        }
      }
    }
  }
}
```

### HTTP 401

Missing or invalid credential.

### HTTP 403

Installation credential required.

### HTTP 404

Member missing or revoked.

## Behavior and supported scope

Requires an installation credential. Tenant owners and activated platform administrators cannot inspect or manage these grants. Returns current eligibility for a non-revoked member, independently of browser session mode. Contains no credentials. Responses are not cached.
