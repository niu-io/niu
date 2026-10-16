---
title: "Create a workspace API key with optional initial limits and policies"
description: "POST /api/v1/workspaces/{workspace}/keys"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/workspaces/{workspace}/keys`

Issues a new workspace API key and optionally configures initial spending limits, RPM/TPM/concurrency limits, and IP allowlist CIDRs in a single call. Explicit allowed_cidrs: [] denies every source; null or omission leaves sources unrestricted. Matches the independent IP policy endpoint.

Operation: `createWorkspaceKey`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/workspaces/{workspace}/keys" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN" \
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
  "required": [
    "name",
    "ttl_seconds"
  ],
  "properties": {
    "name": {
      "type": "string"
    },
    "allowed_models": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "ttl_seconds": {
      "type": [
        "integer",
        "null"
      ]
    },
    "spending_limit": {
      "type": [
        "object",
        "null"
      ],
      "required": [
        "currency",
        "limit_nanos"
      ],
      "properties": {
        "currency": {
          "type": "string"
        },
        "limit_nanos": {
          "type": [
            "string",
            "null"
          ]
        }
      }
    },
    "requests_per_minute": {
      "type": [
        "integer",
        "null"
      ]
    },
    "tokens_per_minute": {
      "type": [
        "integer",
        "null"
      ]
    },
    "max_concurrent_requests": {
      "type": [
        "integer",
        "null"
      ]
    },
    "allowed_cidrs": {
      "type": [
        "array",
        "null"
      ],
      "description": "Empty array denies every source; null or omission leaves sources unrestricted.",
      "items": {
        "type": "string"
      }
    }
  }
}
```

## Responses

### HTTP 201

Issued key identity, one-time secret, and full key detail

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "id",
    "token",
    "key"
  ],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "token": {
      "type": "string"
    },
    "key": {
      "type": "object"
    }
  }
}
```

## Behavior and supported scope

Issues a new workspace API key and optionally configures initial spending limits, RPM/TPM/concurrency limits, and IP allowlist CIDRs in a single call. Explicit allowed_cidrs: [] denies every source; null or omission leaves sources unrestricted. Matches the independent IP policy endpoint.

**Supported scope:** implemented
