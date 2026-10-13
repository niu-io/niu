---
title: "Assign a configured personal credential to its account"
description: "PUT /admin/v1/vendors/{id}/personal-owner"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /admin/v1/vendors/{id}/personal-owner`

Installation administrator only. Ownership is immutable. Exact retries return success without another audit event. This does not activate Supplier offers, grant funds or qualify commercial supply. Initial assignment rejects credentials with any model route pricing, including disabled mappings; explicitly clear those prices first. Ownership assignment and model publication serialize on the credential row.

Operation: `assignPersonalCredentialOwner`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X PUT "$NIU_ORIGIN/admin/v1/vendors/{id}/personal-owner" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "organization_id",
    "expected_revision"
  ],
  "properties": {
    "organization_id": {
      "type": "string",
      "format": "uuid"
    },
    "expected_revision": {
      "type": "integer",
      "format": "int64",
      "minimum": 1
    }
  }
}
```

## Responses

### HTTP 200

Personal owner assigned or exact assignment already exists.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "assigned"
  ],
  "properties": {
    "assigned": {
      "type": "boolean",
      "const": true
    }
  }
}
```

### HTTP 400

Invalid assignment input.

### HTTP 401

Authentication required.

### HTTP 403

Installation administrator required.

### HTTP 409

Stale revision, different owner, existing model route pricing, commercial qualification or unavailable account.

## Behavior and supported scope

Installation administrator only. Ownership is immutable. Exact retries return success without another audit event. This does not activate Supplier offers, grant funds or qualify commercial supply. Initial assignment rejects credentials with any model route pricing, including disabled mappings; explicitly clear those prices first. Ownership assignment and model publication serialize on the credential row.
