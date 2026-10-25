---
title: "Read an API key's Credits spending limit and commitment"
description: "GET /api/v1/workspaces/{workspace}/keys/{key}/units/limit"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/workspaces/{workspace}/keys/{key}/units/limit`

Workspace read permission required. Rotated keys share their original spending root identity. Returns the key lineage's explicit Credits atom limit, policy revision, committed atoms (settled charges minus restorations plus unresolved holds and known overrun liabilities), remaining allowance, and whether an existing monetary key limit is preserved. A preserved monetary key limit blocks Credits admission until an explicit Credits key limit revision is published. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

Operation: `getKeyCustomerUnitSpendingLimitByWorkspace`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/workspaces/{workspace}/keys/{key}/units/limit" \
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

### key

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

Current API key Credits spending limit state

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
        "unit",
        "limit_atoms",
        "revision",
        "definition_revision",
        "committed_atoms",
        "remaining_atoms",
        "monetary_limit_preserved",
        "credits_admission_blocked_by_monetary_limit"
      ],
      "properties": {
        "unit": {
          "type": [
            "object",
            "null"
          ],
          "additionalProperties": false,
          "required": [
            "definition_revision",
            "name",
            "display_precision",
            "atoms_per_unit"
          ],
          "properties": {
            "definition_revision": {
              "type": "string",
              "pattern": "^[1-9][0-9]*$"
            },
            "name": {
              "type": "string"
            },
            "display_precision": {
              "type": "integer",
              "minimum": 0,
              "maximum": 9
            },
            "atoms_per_unit": {
              "type": "string",
              "const": "1000000000"
            }
          }
        },
        "limit_atoms": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "revision": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[1-9][0-9]*$"
        },
        "definition_revision": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[1-9][0-9]*$"
        },
        "committed_atoms": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "remaining_atoms": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "monetary_limit_preserved": {
          "type": "boolean"
        },
        "credits_admission_blocked_by_monetary_limit": {
          "type": "boolean"
        }
      }
    }
  }
}
```

### HTTP 401

Authentication required or revoked

### HTTP 403

Workspace access denied

### HTTP 404

Key does not exist in the authorized workspace

### HTTP 503

Storage unavailable

## Behavior and supported scope

Workspace read permission required. Rotated keys share their original spending root identity. Returns the key lineage's explicit Credits atom limit, policy revision, committed atoms (settled charges minus restorations plus unresolved holds and known overrun liabilities), remaining allowance, and whether an existing monetary key limit is preserved. A preserved monetary key limit blocks Credits admission until an explicit Credits key limit revision is published. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

**Supported scope:** implemented
