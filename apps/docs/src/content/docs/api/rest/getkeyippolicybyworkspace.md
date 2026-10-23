---
title: "Read API key source policy"
description: "GET /api/v1/workspaces/{workspace}/keys/{key}/ip-policy"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/workspaces/{workspace}/keys/{key}/ip-policy`

Scoped readers may inspect the policy shared across secret rotations. Storage reads use a read-only snapshot with transaction-local 250 ms lock and 2 s statement limits. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

Operation: `getKeyIpPolicyByWorkspace`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/workspaces/{workspace}/keys/{key}/ip-policy" \
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

Null revision means never configured. Null networks permit all sources; an empty array denies all sources.

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
        "allowed_cidrs",
        "revision"
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
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[1-9][0-9]*$"
        }
      }
    }
  }
}
```

### HTTP 401

Authentication required

### HTTP 403

Workspace access denied

### HTTP 404

Workspace is outside operator scope, or key is absent from authorized workspace

### HTTP 503

Storage read unavailable, including a bounded lock or statement timeout. Preserve known policy/history; this does not permit bypassing source restrictions.

## Behavior and supported scope

Scoped readers may inspect the policy shared across secret rotations. Storage reads use a read-only snapshot with transaction-local 250 ms lock and 2 s statement limits. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

**Supported scope:** implemented
