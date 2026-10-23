---
title: "Set API key spending limit"
description: "PUT /api/v1/workspaces/{workspace}/keys/{key}/spending-limit/{currency}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/workspaces/{workspace}/keys/{key}/spending-limit/{currency}`

Workspace/company owner or installation administrator. Cap includes settled customer charges minus refunds plus unreleased reservations, across secret rotations. Lowering below committed liability is rejected. Account and workspace limits still apply. Writes do not add funds. Null explicitly restores unlimited; omission is rejected. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

Operation: `setKeySpendingLimitByWorkspace`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/workspaces/{workspace}/keys/{key}/spending-limit/{currency}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### workspace

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### key

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
    "limit_nanos",
    "expected_revision"
  ],
  "properties": {
    "limit_nanos": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$",
      "description": "Nonnegative signed-64-bit nanounits or explicit null."
    },
    "expected_revision": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Zero for initial configuration; maximum 9223372036854775806."
    }
  }
}
```

## Responses

### HTTP 200

New immutable policy revision recorded.

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
          "pattern": "^[1-9][0-9]*$"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid amount or currency

### HTTP 401

Authentication required

### HTTP 402

Proposed limit is below committed key liability

### HTTP 403

Owner permission required

### HTTP 404

Key does not exist in the authorized workspace

### HTTP 409

Stale revision, missing account, or unresolved attribution

### HTTP 422

Missing or invalid body fields

## Behavior and supported scope

Workspace/company owner or installation administrator. Cap includes settled customer charges minus refunds plus unreleased reservations, across secret rotations. Lowering below committed liability is rejected. Account and workspace limits still apply. Writes do not add funds. Null explicitly restores unlimited; omission is rejected. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

**Supported scope:** implemented
