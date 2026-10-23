---
title: "Create an operator and issue its first session token"
description: "POST /api/v1/operators"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/operators`

Requires a permitted owner or installation administrator. Every user belongs to a company and may be workspace-scoped. By default a temporary session is issued once and expires_in_seconds is required. For recoverable onboarding, pass issue_session false with Idempotency-Key and omit expires_in_seconds. The identity and receipt commit together; matching retries return current metadata for the original identity with null session/token. Changed input, revoked or deleted identities return 409; replay never restores access or issues a credential. The receipt namespace is company-scoped, distinct from company/workspace creation. Authorization is checked before receipt lookup.

Operation: `adminCreateOperator`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/operators" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### Idempotency-Key

Location: **header**. Optional. Required only for identity-only creation; 1–128 visible ASCII characters. Retain the same key and input after an uncertain outcome.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 128
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
    "organization_id",
    "name",
    "role"
  ],
  "allOf": [
    {
      "if": {
        "required": [
          "issue_session"
        ],
        "properties": {
          "issue_session": {
            "const": false
          }
        }
      },
      "then": {
        "not": {
          "required": [
            "expires_in_seconds"
          ]
        }
      },
      "else": {
        "required": [
          "expires_in_seconds"
        ]
      }
    }
  ],
  "properties": {
    "issue_session": {
      "type": "boolean",
      "default": true,
      "description": "False requires Idempotency-Key and forbids expires_in_seconds."
    },
    "organization_id": {
      "type": "string",
      "format": "uuid"
    },
    "project_id": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid",
      "description": "Optional workspace-level restriction within the organization."
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "role": {
      "type": "string",
      "enum": [
        "owner",
        "admin",
        "viewer"
      ]
    },
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

User created or identity-only replay confirmed; session/token are null for identity-only creation. Cache-Control no-store.

### HTTP 400

Invalid role, name or session lifetime.

### HTTP 401

Missing, invalid, expired or revoked credentials.

### HTTP 403

The authenticated operator is not an owner.

## Behavior and supported scope

Requires a permitted owner or installation administrator. Every user belongs to a company and may be workspace-scoped. By default a temporary session is issued once and expires_in_seconds is required. For recoverable onboarding, pass issue_session false with Idempotency-Key and omit expires_in_seconds. The identity and receipt commit together; matching retries return current metadata for the original identity with null session/token. Changed input, revoked or deleted identities return 409; replay never restores access or issues a credential. The receipt namespace is company-scoped, distinct from company/workspace creation. Authorization is checked before receipt lookup.
