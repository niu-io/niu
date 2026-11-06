---
title: "Cancel a pending member invitation"
description: "DELETE /api/v1/invitations/{invitation}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /api/v1/invitations/{invitation}`

Current organization Owner or installation administrator with authority over the invitation's exact scope. Cancellation prevents further redemption and records an immutable lifecycle event. Repeated cancellation is idempotent. Accepted invitations cannot be canceled here because the resulting member must be managed in the member list. Foreign and organization-wide invitations outside a project-scoped caller's authority are concealed with 404.

Operation: `cancelMemberInvitation`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X DELETE "$NIU_ORIGIN/api/v1/invitations/{invitation}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### invitation

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

Invitation is canceled or was already canceled.

### HTTP 400

Invalid invitation reference.

### HTTP 403

Member management requires organization Owner authority.

### HTTP 404

Invitation is outside the caller's scope.

### HTTP 409

Invitation was already accepted; manage the member instead.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Current organization Owner or installation administrator with authority over the invitation's exact scope. Cancellation prevents further redemption and records an immutable lifecycle event. Repeated cancellation is idempotent. Accepted invitations cannot be canceled here because the resulting member must be managed in the member list. Foreign and organization-wide invitations outside a project-scoped caller's authority are concealed with 404.

**Supported scope:** implemented
