---
title: "Read active upstream incidents affecting this workspace"
description: "GET /api/v1/workspaces/{workspace}/incidents"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/workspaces/{workspace}/incidents`

Requires current workspace read authority. Returns only model aliases for active incidents with a recorded failed request in this exact workspace. No Provider identity, upstream details, procurement data, request content or other workspace information is returned. At most 50 models are returned; more indicates additional results. Empty means no covered incident observed for this workspace, not proof of healthy supply. No upstream requests or mutations. Cache-Control no-store.

Operation: `listWorkspaceIncidents`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/workspaces/{workspace}/incidents" \
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

## Request body

No request body is declared.

## Responses

### HTTP 200

Workspace-scoped active incident projection

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "more"
  ],
  "properties": {
    "data": {
      "type": "array",
      "maxItems": 50,
      "items": {
        "type": "object",
        "required": [
          "model"
        ],
        "properties": {
          "model": {
            "type": "string"
          }
        }
      }
    },
    "more": {
      "type": "boolean"
    }
  }
}
```

### HTTP 401

Authentication required

### HTTP 403

Workspace authority required

### HTTP 404

Workspace unavailable

### HTTP 503

Incident evidence unavailable

## Behavior and supported scope

Requires current workspace read authority. Returns only model aliases for active incidents with a recorded failed request in this exact workspace. No Provider identity, upstream details, procurement data, request content or other workspace information is returned. At most 50 models are returned; more indicates additional results. Empty means no covered incident observed for this workspace, not proof of healthy supply. No upstream requests or mutations. Cache-Control no-store.

**Supported scope:** implemented
