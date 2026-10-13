---
title: "Delete saved asset-creation request content"
description: "DELETE /admin/v1/organizations/{organization}/projects/{project}/asset-group-intents/{intent}/request"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /admin/v1/organizations/{organization}/projects/{project}/asset-group-intents/{intent}/request`

Requires workspace write access. Erases active-database request content while preserving reconciliation metadata and an immutable deletion event. Repeated or absent intent deletion returns 204 without disclosing existence. Does not delete upstream assets, backups or credentials. Prepared intents cannot dispatch after content deletion; already dispatched intents remain reconciliation work.

Operation: `deleteAssetGroupRequest`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/asset-group-intents/{intent}/request" \
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

### intent

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

### HTTP 204

Content absent or erased; no response body.

### HTTP 401

Member or installation session required; inference keys are not accepted.

### HTTP 403

Workspace write permission required.

### HTTP 404

Workspace outside the authorized scope.

## Behavior and supported scope

Requires workspace write access. Erases active-database request content while preserving reconciliation metadata and an immutable deletion event. Repeated or absent intent deletion returns 204 without disclosing existence. Does not delete upstream assets, backups or credentials. Prepared intents cannot dispatch after content deletion; already dispatched intents remain reconciliation work.
