---
title: "Create a Provider business identity"
description: "POST /admin/v1/providers"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/providers`

Requires platform administration. Creation grants no membership, qualification, offer or permission to resell supply. Stores the trimmed name and an immutable creation audit.

Operation: `createProviderBusiness`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/providers" \
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
    "name"
  ],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100,
      "description": "Nonblank after trimming; at most 100 UTF-8 bytes before trimming; no control characters. Saved value is trimmed."
    }
  }
}
```

## Responses

### HTTP 200

Created identity

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
        "id"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid Provider name

### HTTP 401

Missing, expired or revoked administrative credential

### HTTP 403

Platform administration required

### HTTP 422

Malformed body or unknown field

### HTTP 503

Storage unavailable

## Behavior and supported scope

Requires platform administration. Creation grants no membership, qualification, offer or permission to resell supply. Stores the trimmed name and an immutable creation audit.

**Supported scope:** implemented
