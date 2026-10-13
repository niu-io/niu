---
title: "Permanently delete saved result references with workspace write access"
description: "DELETE /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/results"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/results`

Reuses current selected-key model access and permanent deletion markers. Preserves status and accounting; does not delete Supplier media or previous downloads.

Operation: `deleteDashboardVideoResults`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/results" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
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

### key

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### job

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

Local result references deleted permanently

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "deleted"
  ],
  "properties": {
    "deleted": {
      "const": true
    }
  }
}
```

### HTTP 401

Invalid session or selected key

### HTTP 403

Write access denied

### HTTP 404

Missing or inaccessible job

## Behavior and supported scope

Reuses current selected-key model access and permanent deletion markers. Preserves status and accounting; does not delete Supplier media or previous downloads.
