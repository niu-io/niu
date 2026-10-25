---
title: "Set the workspace Credits spending limit"
description: "PUT /api/v1/workspaces/{workspace}/units/limit"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/workspaces/{workspace}/units/limit`

Workspace/company owner or installation administrator required and rechecked under lock. Sets an exact Credits atom cap or explicit null for unlimited, using optimistic revision checking and durable idempotency. Lowering below committed workspace liability (charges minus restorations plus unresolved holds and known overrun liabilities) returns 402. Preserves existing monetary workspace limits for currency mode while replacing their blocking effect in Credits admission. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

Operation: `setWorkspaceCustomerUnitSpendingLimitByWorkspace`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/workspaces/{workspace}/units/limit" \
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "limit_atoms",
    "expected_revision",
    "idempotency_key"
  ],
  "properties": {
    "limit_atoms": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^(0|[1-9][0-9]*)$",
      "description": "Canonical nonnegative signed-64-bit integer string or explicit null for unlimited."
    },
    "expected_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]*)$",
      "description": "Zero for initial configuration; maximum 9223372036854775806."
    },
    "idempotency_key": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

## Responses

### HTTP 200

Immutable policy revision receipt

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "revision",
        "expected_revision",
        "definition_revision",
        "limit_atoms",
        "recorded_at",
        "actor_kind",
        "actor_name"
      ],
      "properties": {
        "revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        },
        "expected_revision": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "definition_revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        },
        "limit_atoms": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "recorded_at": {
          "type": "string",
          "format": "date-time"
        },
        "actor_kind": {
          "type": "string",
          "enum": [
            "installation",
            "member"
          ]
        },
        "actor_name": {
          "type": "string"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid integer string

### HTTP 401

Authentication required or revoked

### HTTP 402

Proposed limit is below committed workspace liability

### HTTP 403

Owner permission required

### HTTP 404

Workspace not found in the authorized scope

### HTTP 409

Stale revision, conflicting idempotency key or missing published unit definition

### HTTP 422

Malformed request body

### HTTP 503

Storage unavailable

## Behavior and supported scope

Workspace/company owner or installation administrator required and rechecked under lock. Sets an exact Credits atom cap or explicit null for unlimited, using optimistic revision checking and durable idempotency. Lowering below committed workspace liability (charges minus restorations plus unresolved holds and known overrun liabilities) returns 402. Preserves existing monetary workspace limits for currency mode while replacing their blocking effect in Credits admission. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

**Supported scope:** implemented
