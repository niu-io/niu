---
title: "Explicit installation oversight of the supplier dashboard"
description: "GET /admin/v1/providers/{provider}/administration"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/providers/{provider}/administration`

Only an active Supplier is readable. Soft-deleted and missing Suppliers return the existing unavailable-resource conflict; audit history is retained.

Operation: `getProviderAdministrationDashboard`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/providers/{provider}/administration"
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

Same dashboard snapshot as the supplier endpoint

### HTTP 403

Installation access required

### HTTP 409

Supplier is missing or deleted

## Behavior and supported scope

Only an active Supplier is readable. Soft-deleted and missing Suppliers return the existing unavailable-resource conflict; audit history is retained.
