---
title: "Read customer-facing balance summary for the active or selected organization"
description: "GET /api/v1/credits"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

`GET /api/v1/credits`

Requires an authorized member session or installation credential. Defaults to the caller's active organization; installation callers may pass organization_id. Returns customer-facing balance summaries only, never Provider purchase costs or platform margins.

Operation: `getOrganizationCredits`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/credits" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### organization_id

Location: **query**. Optional. Optional organization UUID. Defaults to the active session organization.

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

Customer balance summary for the resolved organization.

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
          "currency"
        ],
        "properties": {
          "currency": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

### HTTP 400

Installation caller omitted organization_id.

### HTTP 401

Authentication required.

### HTTP 404

Organization missing or outside authorized scope.

## Behavior and supported scope

Requires an authorized member session or installation credential. Defaults to the caller's active organization; installation callers may pass organization_id. Returns customer-facing balance summaries only, never Provider purchase costs or platform margins.

**Supported scope:** implemented
