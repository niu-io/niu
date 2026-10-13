---
title: "Revoke an operator and all of its sessions"
description: "DELETE /admin/v1/operators/{operator}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /admin/v1/operators/{operator}`



Operation: `adminRevokeOperator`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/admin/v1/operators/{operator}" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

### operator

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

Operator and active sessions revoked.

### HTTP 401

Missing, invalid, expired or revoked credentials.

### HTTP 403

The authenticated operator is not an owner.

### HTTP 409

Operator was already revoked or does not exist.

## Behavior and supported scope
