---
title: "List session expiry and revocation metadata"
description: "GET /api/v1/operators/{operator}/sessions"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/operators/{operator}/sessions`



Operation: `adminListOperatorSessions`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/operators/{operator}/sessions" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
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

### HTTP 200

Session identifiers and expiry metadata; credentials are never returned.

### HTTP 401

Missing, invalid, expired or revoked credentials.

### HTTP 403

The authenticated operator is not an owner.

## Behavior and supported scope
