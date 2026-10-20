---
title: "Issue an additional one-time operator session token"
description: "POST /api/v1/operators/{operator}/sessions"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/operators/{operator}/sessions`



Operation: `adminIssueOperatorSession`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/operators/{operator}/sessions" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "expires_in_seconds"
  ],
  "properties": {
    "expires_in_seconds": {
      "type": "integer",
      "minimum": 60,
      "maximum": 31536000
    }
  }
}
```

## Responses

### HTTP 201

Session created; response includes Cache-Control no-store and the token is shown once.

### HTTP 400

Session lifetime is outside the supported range.

### HTTP 401

Missing, invalid, expired or revoked credentials.

### HTTP 403

The authenticated operator is not an owner.

### HTTP 409

Operator is unavailable.

## Behavior and supported scope
