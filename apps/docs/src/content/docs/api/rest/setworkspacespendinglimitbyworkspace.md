---
title: "Set a workspace spending limit"
description: "PUT /api/v1/workspaces/{workspace}/spending-limit/{currency}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/workspaces/{workspace}/spending-limit/{currency}`

Scoped owner or installation administrator required. Both input fields are nonnegative decimal strings, not null. expected_revision 0 creates the first limit; later writes require the saved revision. Zero denies new paid liability; there is no null reset on this endpoint. A limit below existing commitment is rejected. Writes append actor history and never change company funds. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

Operation: `setWorkspaceSpendingLimitByWorkspace`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/workspaces/{workspace}/spending-limit/{currency}" \
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
  "required": [
    "limit_nanos",
    "expected_revision"
  ],
  "properties": {
    "limit_nanos": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Exact nonnegative decimal integer, within signed 64-bit range."
    },
    "expected_revision": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Exact nonnegative decimal integer, within signed 64-bit range."
    }
  },
  "additionalProperties": false
}
```

## Responses

### HTTP 200

Current scoped state

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
        "revision"
      ],
      "properties": {
        "revision": {
          "type": "string",
          "pattern": "^[0-9]+$",
          "description": "Exact nonnegative decimal integer, within signed 64-bit range."
        }
      }
    }
  }
}
```

### HTTP 400

Invalid currency, decimal value or history query

### HTTP 401

Authentication required

### HTTP 402

Limit is below existing workspace commitment

### HTTP 403

Insufficient role permissions

### HTTP 404

Workspace unavailable in the authorized scope

### HTTP 409

Revision conflict or unavailable currency account

### HTTP 422

JSON input shape is invalid

## Behavior and supported scope

Scoped owner or installation administrator required. Both input fields are nonnegative decimal strings, not null. expected_revision 0 creates the first limit; later writes require the saved revision. Zero denies new paid liability; there is no null reset on this endpoint. A limit below existing commitment is rejected. Writes append actor history and never change company funds. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

**Supported scope:** implemented
