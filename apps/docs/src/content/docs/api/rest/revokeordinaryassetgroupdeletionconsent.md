---
title: "Revoke local deletion consent without erasing history"
description: "DELETE /admin/v1/vendors/{id}/asset-management/group-deletion-consents/{consent}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /admin/v1/vendors/{id}/asset-management/group-deletion-consents/{consent}`

Platform administrator only. Idempotent and scoped; absent or mismatched records return 204 without changes. Does not delete an upstream group, erase claims/outcomes, cancel already dispatched work or restore consumed consent. Future claims must recheck revocation. No billing mutation.

Operation: `revokeOrdinaryAssetGroupDeletionConsent`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/admin/v1/vendors/{id}/asset-management/group-deletion-consents/{consent}" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
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

### consent

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### organization_id

Location: **query**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### project_id

Location: **query**. **Required.**

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

Consent revoked or no matching consent.

### HTTP 400

Invalid scope.

### HTTP 401

Authentication required.

### HTTP 403

Platform administrator required.

## Behavior and supported scope

Platform administrator only. Idempotent and scoped; absent or mismatched records return 204 without changes. Does not delete an upstream group, erase claims/outcomes, cancel already dispatched work or restore consumed consent. Future claims must recheck revocation. No billing mutation.
