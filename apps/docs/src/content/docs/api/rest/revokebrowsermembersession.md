---
title: "Revoke and clear the current browser member session"
description: "POST /api/v1/auth/browser/logout"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/auth/browser/logout`

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/auth/browser/logout" \
  --cookie "__Host-niu_member_session=$NIU_MEMBER_SESSION" \
  -H 'Origin: <ORIGIN>'
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
