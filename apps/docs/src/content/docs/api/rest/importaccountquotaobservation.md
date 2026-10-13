---
title: "Import a versioned provider quota window observation"
description: "POST /admin/v1/organizations/{organization}/projects/{project}/accounts/{account}/quota"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/organizations/{organization}/projects/{project}/accounts/{account}/quota`

Records an observation only. It does not call the provider, dispatch inference, or reset provider allowance. Exact replay returns the original ID; a different payload for the same account, window, and observation timestamp returns 409.

Operation: `importAccountQuotaObservation`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/accounts/{account}/quota" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### organization

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### project

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### account

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
    "schema_version",
    "window_key",
    "unit",
    "observed_at_ms",
    "valid_until_ms",
    "resets_at_ms",
    "source"
  ],
  "properties": {
    "schema_version": {
      "type": "integer",
      "const": 1
    },
    "window_key": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "unit": {
      "type": "string",
      "enum": [
        "tokens",
        "requests",
        "millionths_of_window"
      ]
    },
    "remaining": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": 0
    },
    "maximum": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": 0
    },
    "observed_at_ms": {
      "type": "integer",
      "minimum": 0
    },
    "valid_until_ms": {
      "type": "integer",
      "minimum": 1
    },
    "resets_at_ms": {
      "type": "integer",
      "minimum": 1
    },
    "source": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  }
}
```

## Responses

### HTTP 201

Observation persisted.

### HTTP 400

Invalid or future observation.

### HTTP 401

Invalid administrator token.

### HTTP 409

Duplicate observation for this provider window and timestamp.

## Behavior and supported scope

Records an observation only. It does not call the provider, dispatch inference, or reset provider allowance. Exact replay returns the original ID; a different payload for the same account, window, and observation timestamp returns 409.
