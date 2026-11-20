---
title: "Switch the active organization for the current member session"
description: "PUT /api/v1/session/organization"
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/session/organization`

Requires an authenticated member session. Accepts an organization UUID, durable slug, or retained slug alias already granted to this account identity. Updates the active operator membership bound to the session and returns the refreshed session identity.

Operation: `switchSessionOrganization`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/session/organization" \
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
    "organization_id"
  ],
  "properties": {
    "organization": {
      "type": "string",
      "description": "Organization UUID or slug."
    },
    "organization_id": {
      "type": "string",
      "description": "Organization UUID or slug."
    }
  }
}
```

## Responses

### HTTP 200

Updated session identity scoped to the selected organization.

### HTTP 400

Invalid organization reference or JSON body.

### HTTP 401

Invalid, expired or revoked member session.

### HTTP 403

Installation credentials cannot switch member organization scope.

### HTTP 404

No active membership in the requested organization.

## Behavior and supported scope

Requires an authenticated member session. Accepts an organization UUID, durable slug, or retained slug alias already granted to this account identity. Updates the active operator membership bound to the session and returns the refreshed session identity.

**Supported scope:** implemented
