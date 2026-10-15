---
title: "List configured model routes"
description: "GET /api/v1/models"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/models`

Account-scoped sessions automatically include their own enabled personal models. Installation administrators may select an account with organization_id; without it only shared models are returned. Personal models remain excluded from the public catalog. Customer responses omit upstream names and credentials.

Operation: `adminListModels`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/models" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
```

## Parameters

### organization_id

Location: **query**. Optional.

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

Public and upstream model names with provider identifiers and catalog visibility.

### HTTP 401

Missing or invalid administrator credentials.

### HTTP 404

Selected account is outside the authenticated scope.

## Behavior and supported scope

Account-scoped sessions automatically include their own enabled personal models. Installation administrators may select an account with organization_id; without it only shared models are returned. Personal models remain excluded from the public catalog. Customer responses omit upstream names and credentials.
