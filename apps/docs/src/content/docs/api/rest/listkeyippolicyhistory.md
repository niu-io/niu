---
title: "List API key source policy history"
description: "GET /api/v1/organizations/{organization}/projects/{project}/keys/{key}/ip-policy/history"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/keys/{key}/ip-policy/history`

Scoped readers receive descending revisions shared across rotations. Use the last revision as the next page cursor. Storage reads use a read-only snapshot with transaction-local 250 ms lock and 2 s statement limits.

Operation: `listKeyIpPolicyHistory`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/keys/{key}/ip-policy/history" \
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

Immutable policy history; no internal actor identifiers.

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
          "allowed_cidrs",
          "revision",
          "recorded_at",
          "actor_kind",
          "actor_name"
        ],
        "properties": {
          "allowed_cidrs": {
            "type": [
              "array",
              "null"
            ],
            "maxItems": 64,
            "items": {
              "type": "string",
              "maxLength": 64
            },
            "description": "IPv4/IPv6 addresses or CIDRs, normalized to network CIDRs. Null permits all; empty denies all."
          },
          "revision": {
            "type": "string",
            "pattern": "^[1-9][0-9]*$"
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
}
```

### HTTP 400

Invalid pagination

### HTTP 401

Authentication required

### HTTP 403

Workspace access denied

### HTTP 404

Workspace is outside operator scope, or key is absent from authorized workspace

### HTTP 503

Storage read unavailable, including a bounded lock or statement timeout. Preserve known policy/history; this does not permit bypassing source restrictions.

## Behavior and supported scope

Scoped readers receive descending revisions shared across rotations. Use the last revision as the next page cursor. Storage reads use a read-only snapshot with transaction-local 250 ms lock and 2 s statement limits.

**Supported scope:** implemented
