---
title: "Revoke and clear the current browser member session"
description: "POST /admin/v1/auth/browser/logout"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/auth/browser/logout`

Requires the configured HTTPS Origin; supplied Sec-Fetch-Site must be a single same-origin value. Revokes the supplied member session and clears the cookie. Already expired or revoked sessions also clear the cookie successfully. Storage failure does not claim successful revocation or clear the cookie. Responses use Cache-Control no-store.

Operation: `revokeBrowserMemberSession`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "memberCookie": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/auth/browser/logout" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

### Origin

Location: **header**. **Required.**

```json
{
  "type": "string"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 204

Session unusable and cookie expired; no response body

### HTTP 401

Missing or malformed member cookie

### HTTP 403

Missing or mismatched Origin

### HTTP 501

Password login not configured

### HTTP 503

Revocation unavailable; retry before assuming sign-out

## Behavior and supported scope

Requires the configured HTTPS Origin; supplied Sec-Fetch-Site must be a single same-origin value. Revokes the supplied member session and clears the cookie. Already expired or revoked sessions also clear the cookie successfully. Storage failure does not claim successful revocation or clear the cookie. Responses use Cache-Control no-store.
