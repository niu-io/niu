---
title: "Configure approved credit and low-balance threshold"
description: "PUT /api/v1/organizations/{organization}/billing/accounts/{currency}/policy"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/organizations/{organization}/billing/accounts/{currency}/policy`

Explicit platform administration required; ordinary company owners/admins cannot approve their own credit. Creates a zero-balance account if absent, with expected revision zero. Updates are revision checked and recorded in immutable history with an authenticated credit-approval actor in the same transaction. Historical revisions remain unattributed. Credit changes do not credit funds. Reductions that would invalidate held reservations are rejected. With no holds, reduced credit can exhaust capacity while preserving the actual debt. A null warning threshold disables low-balance warnings. This configures warning state, not notification-channel delivery.

Operation: `configureCustomerBalancePolicy`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/accounts/{currency}/policy" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### organization

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### currency

Location: **path**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
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
    "credit_limit_nanos",
    "expected_revision"
  ],
  "properties": {
    "credit_limit_nanos": {
      "type": "string",
      "pattern": "^[0-9]+$"
    },
    "warning_threshold_nanos": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$"
    },
    "expected_revision": {
      "type": "string",
      "pattern": "^[0-9]+$"
    }
  }
}
```

## Responses

### HTTP 200

Policy saved

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "revision": {
          "type": "string",
          "pattern": "^[0-9]+$"
        }
      },
      "required": [
        "revision"
      ]
    }
  },
  "required": [
    "data"
  ]
}
```

### HTTP 400

Invalid currency, amount or revision

### HTTP 401

Authentication required

### HTTP 403

Installation write access required

### HTTP 409

Stale revision, unknown company or outstanding reservations prevent credit reduction

## Behavior and supported scope

Explicit platform administration required; ordinary company owners/admins cannot approve their own credit. Creates a zero-balance account if absent, with expected revision zero. Updates are revision checked and recorded in immutable history with an authenticated credit-approval actor in the same transaction. Historical revisions remain unattributed. Credit changes do not credit funds. Reductions that would invalidate held reservations are rejected. With no holds, reduced credit can exhaust capacity while preserving the actual debt. A null warning threshold disables low-balance warnings. This configures warning state, not notification-channel delivery.

**Supported scope:** implemented
