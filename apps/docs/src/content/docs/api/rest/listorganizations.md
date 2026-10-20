---
title: "List authorized company metadata"
description: "GET /api/v1/organizations"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations`

Requires management read authorization. Member company scope is applied before paging, including workspace-scoped members. Stable creation order; renaming does not move entries. Follow next_cursor as after with unchanged credentials until null. Pages reflect live data, not a frozen snapshot; deletion of a cursor requires restarting traversal. Returns only identity/name metadata, never financial data or credentials.

Operation: `listOrganizations`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### after

Location: **query**. Optional.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 1000,
  "default": 1000
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Authorized company metadata.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_cursor"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "name"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "name": {
            "type": "string"
          }
        }
      }
    },
    "next_cursor": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    }
  }
}
```

### HTTP 400

Invalid page size, cursor syntax or unknown query parameter.

### HTTP 401

Missing, invalid, expired or revoked management credential.

### HTTP 403

Credential lacks management read access.

### HTTP 409

Cursor is missing, deleted or outside current company scope.

## Behavior and supported scope

Requires management read authorization. Member company scope is applied before paging, including workspace-scoped members. Stable creation order; renaming does not move entries. Follow next_cursor as after with unchanged credentials until null. Pages reflect live data, not a frozen snapshot; deletion of a cursor requires restarting traversal. Returns only identity/name metadata, never financial data or credentials.

**Supported scope:** implemented
