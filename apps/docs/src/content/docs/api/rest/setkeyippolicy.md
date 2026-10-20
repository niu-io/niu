---
title: "Set API key source policy"
description: "PUT /api/v1/organizations/{organization}/projects/{project}/keys/{key}/ip-policy"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/organizations/{organization}/projects/{project}/keys/{key}/ip-policy`

Owner or installation administrator only. Rotation preserves this policy. Does not cancel already admitted requests.

Operation: `setKeyIpPolicy`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/keys/{key}/ip-policy" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "allowed_cidrs",
    "expected_revision"
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

New policy and immutable history committed atomically.

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
          "pattern": "^[1-9][0-9]*$"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid network or revision

### HTTP 401

Authentication required

### HTTP 403

Owner permission required

### HTTP 404

Workspace is outside operator scope, or key is absent from authorized workspace

### HTTP 409

Stale policy revision

### HTTP 422

Missing or invalid JSON fields

## Behavior and supported scope

Owner or installation administrator only. Rotation preserves this policy. Does not cancel already admitted requests.

**Supported scope:** implemented
