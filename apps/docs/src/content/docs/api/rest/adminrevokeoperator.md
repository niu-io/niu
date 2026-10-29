---
title: "Revoke an operator and all of its sessions"
description: "DELETE /api/v1/operators/{operator}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /api/v1/operators/{operator}`



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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X DELETE "$NIU_ORIGIN/api/v1/operators/{operator}" \
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
