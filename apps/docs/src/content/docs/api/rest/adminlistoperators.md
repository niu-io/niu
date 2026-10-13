---
title: "List operator identities without session credentials"
description: "GET /admin/v1/operators"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/operators`

Requires a workspace owner or a configured bootstrap administrator token. Results are limited to the caller's organization/project unless the caller uses installation bootstrap credentials. Responses contain session identifiers and expiry metadata but never token hashes or bearer tokens.

Operation: `adminListOperators`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/operators" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Persistent operator identities and assigned roles.

### HTTP 401

Missing, invalid, expired or revoked credentials.

### HTTP 403

The authenticated operator is not an owner.

## Behavior and supported scope

Requires a workspace owner or a configured bootstrap administrator token. Results are limited to the caller's organization/project unless the caller uses installation bootstrap credentials. Responses contain session identifiers and expiry metadata but never token hashes or bearer tokens.
