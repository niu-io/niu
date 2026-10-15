---
title: "Sign out the member session supplied in Authorization"
description: "POST /api/v1/auth/logout"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/auth/logout`

Available to every member role, independently of password login configuration. Revokes only the supplied active session and records a metadata-only audit event atomically. Other sessions remain active. Installation credentials are not member sessions. When password login is configured, a supplied Origin must match its HTTPS origin. All responses use Cache-Control no-store.

Operation: `revokeCurrentMemberSession`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/auth/logout" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 204

Current session revoked; no response body

### HTTP 401

Missing, invalid, expired or already revoked member session

### HTTP 403

Supplied Origin does not match the configured origin

### HTTP 503

Storage unavailable; retry sign-out before assuming revocation

## Behavior and supported scope

Available to every member role, independently of password login configuration. Revokes only the supplied active session and records a metadata-only audit event atomically. Other sessions remain active. Installation credentials are not member sessions. When password login is configured, a supplied Origin must match its HTTPS origin. All responses use Cache-Control no-store.
