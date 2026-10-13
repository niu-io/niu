---
title: "Revoke one account's asset qualification"
description: "DELETE /admin/v1/vendors/{id}/asset-management/authorizations/{authorization}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /admin/v1/vendors/{id}/asset-management/authorizations/{authorization}`

Platform administrator only. Appends an immutable actor-attributed revocation. Missing, already revoked, and mismatched-account identifiers return the same idempotent response; another account's record is never revoked. Does not delete audit records or contact upstream.

Operation: `revokeAssetOperationAuthorization`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/admin/v1/vendors/{id}/asset-management/authorizations/{authorization}" \
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

### authorization

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

Local revocation applied or no matching active record.

### HTTP 401

Authentication required.

### HTTP 403

Platform administrator required.

## Behavior and supported scope

Platform administrator only. Appends an immutable actor-attributed revocation. Missing, already revoked, and mismatched-account identifiers return the same idempotent response; another account's record is never revoked. Does not delete audit records or contact upstream.
