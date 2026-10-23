---
title: "List workspace spending currencies"
description: "GET /api/v1/workspaces/{workspace}/spending-limit"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/workspaces/{workspace}/spending-limit`

Workspace readers may discover company account currencies and this workspace commitment without company-balance access. Absent limits and revisions are null. No state is changed. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

Operation: `listWorkspaceSpendingLimitsByWorkspace`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/workspaces/{workspace}/spending-limit" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
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

## Request body

No request body is declared.

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
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "currency",
          "limit_nanos",
          "revision",
          "committed_nanos"
        ],
        "properties": {
          "currency": {
            "type": "string",
            "pattern": "^[A-Z]{3}$"
          },
          "limit_nanos": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$",
            "description": "Exact nonnegative decimal integer, within signed 64-bit range."
          },
          "revision": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$",
            "description": "Exact nonnegative decimal integer, within signed 64-bit range."
          },
          "committed_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$",
            "description": "Exact nonnegative decimal integer, within signed 64-bit range."
          }
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

### HTTP 403

Insufficient role permissions

### HTTP 404

Workspace unavailable in the authorized scope

## Behavior and supported scope

Workspace readers may discover company account currencies and this workspace commitment without company-balance access. Absent limits and revisions are null. No state is changed. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

**Supported scope:** implemented
