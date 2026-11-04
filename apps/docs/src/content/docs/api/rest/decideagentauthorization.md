---
title: "Approve or decline an agent connection"
description: "POST /api/v1/auth/agents/{code}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/auth/agents/{code}`

Requires an exact trusted same-origin Origin and a current Operator with write permission. Approval requires organization_id, workspace_id, allowed_models and ttl_seconds, and checks write access to that workspace. A decline may omit both scope fields; if supplied, both are checked. Installation credentials and inference keys cannot decide. Approval validates model aliases and stores explicit scope and finite credential lifetime; it does not return a credential. State transition is one-time, with expiry and active approver checks. Existing workspace billing constraints still apply. No-store.

Operation: `decideAgentAuthorization`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/auth/agents/{code}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Origin: <ORIGIN>' \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### code

Location: **path**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[0-9A-F]{12}$"
}
```

### Origin

Location: **header**. **Required.**

```json
{
  "type": "string",
  "format": "uri"
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
    "approve"
  ],
  "oneOf": [
    {
      "properties": {
        "approve": {
          "enum": [
            false
          ]
        }
      }
    },
    {
      "properties": {
        "approve": {
          "enum": [
            true
          ]
        }
      },
      "required": [
        "organization_id",
        "workspace_id",
        "allowed_models",
        "ttl_seconds"
      ]
    }
  ],
  "properties": {
    "approve": {
      "type": "boolean"
    },
    "organization_id": {
      "type": "string",
      "format": "uuid"
    },
    "workspace_id": {
      "type": "string",
      "format": "uuid"
    },
    "allowed_models": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      }
    },
    "ttl_seconds": {
      "type": "integer",
      "minimum": 60,
      "maximum": 86400
    },
    "invocation_allowed": {
      "type": "boolean",
      "default": true,
      "description": "Whether the issued credential may dispatch inference. False preserves separately granted discovery and management access. Omitted retains legacy invocation authority."
    }
  }
}
```

## Responses

### HTTP 204

Decision persisted

### HTTP 400

Invalid code, grant or lifetime

### HTTP 401

Sign-in required

### HTTP 403

Origin or role refused

### HTTP 404

Workspace outside authorized scope

### HTTP 409

Request already decided or expired

## Behavior and supported scope

Requires an exact trusted same-origin Origin and a current Operator with write permission. Approval requires organization_id, workspace_id, allowed_models and ttl_seconds, and checks write access to that workspace. A decline may omit both scope fields; if supplied, both are checked. Installation credentials and inference keys cannot decide. Approval validates model aliases and stores explicit scope and finite credential lifetime; it does not return a credential. State transition is one-time, with expiry and active approver checks. Existing workspace billing constraints still apply. No-store.

**Supported scope:** implemented
