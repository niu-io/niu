---
title: "List API key Credits spending limit history"
description: "GET /api/v1/organizations/{organization}/projects/{project}/keys/{key}/units/limit/history"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/keys/{key}/units/limit/history`

Workspace read permission required. Returns descending immutable revisions shared across key rotations, with exclusive before_revision pagination. Never exposes internal actor identifiers.

Operation: `listKeyCustomerUnitSpendingLimitHistory`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/keys/{key}/units/limit/history" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
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

### project

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

### before_revision

Location: **query**. Optional.

```json
{
  "type": "integer",
  "format": "int64",
  "minimum": 1
}
```

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 50
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Descending immutable policy revisions

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data",
    "next_before_revision"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
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
    },
    "next_before_revision": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[1-9][0-9]*$"
    }
  }
}
```

### HTTP 400

Invalid history cursor or page size

### HTTP 401

Authentication required or revoked

### HTTP 403

Workspace access denied

### HTTP 404

Key does not exist in the authorized workspace

### HTTP 503

Storage unavailable

## Behavior and supported scope

Workspace read permission required. Returns descending immutable revisions shared across key rotations, with exclusive before_revision pagination. Never exposes internal actor identifiers.

**Supported scope:** implemented
