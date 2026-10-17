---
title: "Explicit installation oversight of the Provider dashboard"
description: "GET /api/v1/providers/{provider}/administration"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/providers/{provider}/administration`

Only an active Provider is readable. Soft-deleted and missing Providers return the existing unavailable-resource conflict; audit history is retained.

Operation: `getProviderAdministrationDashboard`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "operatorBearer": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/providers/{provider}/administration" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
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

### days

Location: **query**. Optional.

```json
{
  "type": "integer",
  "enum": [
    7,
    30,
    90
  ],
  "default": 30
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Same dashboard snapshot as the Provider endpoint

### HTTP 403

Installation access required

### HTTP 409

Provider is missing or deleted

## Behavior and supported scope

Only an active Provider is readable. Soft-deleted and missing Providers return the existing unavailable-resource conflict; audit history is retained.
