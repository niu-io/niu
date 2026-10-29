---
title: "Reconcile an API key creation or rotation request"
description: "GET /api/v1/workspaces/{workspace}/keys/requests/{request}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/workspaces/{workspace}/keys/requests/{request}`

Requires current workspace write access. Returns only a committed outcome and key metadata, never a key secret. Null data means no committed outcome was observed; an in-flight request may still commit, so retry only the same Idempotency-Key and unchanged input. This response is not cacheable.

Operation: `getWorkspaceKeyRequest`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/workspaces/{workspace}/keys/requests/{request}" \
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

### request

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

Observed durable outcome, without secrets

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "oneOf": [
        {
          "type": "null"
        },
        {
          "type": "object",
          "required": [
            "action",
            "key"
          ],
          "properties": {
            "action": {
              "type": "string",
              "enum": [
                "create",
                "rotate"
              ]
            },
            "key": {
              "type": "object",
              "additionalProperties": true
            }
          }
        }
      ]
    }
  }
}
```

### HTTP 401

Authentication required

### HTTP 403

Workspace write access required

### HTTP 404

Workspace is unavailable to this caller

## Behavior and supported scope

Requires current workspace write access. Returns only a committed outcome and key metadata, never a key secret. Null data means no committed outcome was observed; an in-flight request may still commit, so retry only the same Idempotency-Key and unchanged input. This response is not cacheable.

**Supported scope:** implemented
