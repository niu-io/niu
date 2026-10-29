---
title: "Grant, change or disable a Provider membership"
description: "PUT /api/v1/providers/{provider}/members/{operator}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/providers/{provider}/members/{operator}`

Requires platform administration. Grants viewer or manager membership to a non-revoked operator. Provider membership grants no platform configuration authority. Membership state and immutable audit are recorded atomically, including the authorized actor, Provider and affected-member names, and active roles before and after the change. Repeated accepted writes can add audit events. Individual transaction lock waits are bounded to 250 ms and statements to 2 seconds; pool acquisition and whole HTTP duration are not bounded by these settings.

Operation: `setProviderMembership`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/providers/{provider}/members/{operator}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### provider

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

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
    "role",
    "active"
  ],
  "properties": {
    "role": {
      "type": "string",
      "enum": [
        "manager",
        "viewer"
      ]
    },
    "active": {
      "type": "boolean"
    }
  }
}
```

## Responses

### HTTP 200

Membership saved and audited

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "required": [
        "active"
      ],
      "properties": {
        "active": {
          "type": "boolean"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid membership role

### HTTP 401

Missing, expired or revoked administrative credential

### HTTP 403

Platform administration required

### HTTP 409

Missing/deleted Provider or missing/revoked operator

### HTTP 422

Malformed membership input

### HTTP 503

Storage unavailable or transaction lock/statement timeout

## Behavior and supported scope

Requires platform administration. Grants viewer or manager membership to a non-revoked operator. Provider membership grants no platform configuration authority. Membership state and immutable audit are recorded atomically, including the authorized actor, Provider and affected-member names, and active roles before and after the change. Repeated accepted writes can add audit events. Individual transaction lock waits are bounded to 250 ms and statements to 2 seconds; pool acquisition and whole HTTP duration are not bounded by these settings.

**Supported scope:** implemented
