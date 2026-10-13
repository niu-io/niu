---
title: "Discover named platform pricing targets"
description: "GET /admin/v1/pricing/targets"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/pricing/targets`

Explicit platform administration required; ordinary company/workspace roles do not grant access. Configuration only, without usage, balances, statements, content, credentials or procurement. Keyset order is workspace UUID ascending for targets, model alias ascending for tariffs. Pass next_after unchanged as after; null means complete. Limit defaults to 50, maximum 100. Each page is one database snapshot; concurrent inserts before the cursor require refreshing the first page. Missing cursor returns 409. Identifiers are API references, never display labels. Cache-Control no-store. Tariff token rates are exact nanounits per million tokens; minimum and request fees are exact currency nanounits. Empty valid workspace returns an empty page.

Operation: `listPlatformPricingTargets`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  },
  {
    "niuApiKeyAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/pricing/targets" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
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
  "maximum": 100,
  "default": 50
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Configuration page

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_after"
  ],
  "properties": {
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "required": [
          "organization_id",
          "workspace_id",
          "organization_name",
          "workspace_name"
        ],
        "properties": {
          "organization_id": {
            "type": "string",
            "format": "uuid"
          },
          "workspace_id": {
            "type": "string",
            "format": "uuid"
          },
          "organization_name": {
            "type": "string"
          },
          "workspace_name": {
            "type": "string"
          }
        }
      }
    },
    "next_after": {
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

Invalid query

### HTTP 401

Invalid management credential

### HTTP 403

Platform administration required

### HTTP 409

Cursor absent from selected directory

### HTTP 503

Storage unavailable

## Behavior and supported scope

Explicit platform administration required; ordinary company/workspace roles do not grant access. Configuration only, without usage, balances, statements, content, credentials or procurement. Keyset order is workspace UUID ascending for targets, model alias ascending for tariffs. Pass next_after unchanged as after; null means complete. Limit defaults to 50, maximum 100. Each page is one database snapshot; concurrent inserts before the cursor require refreshing the first page. Missing cursor returns 409. Identifiers are API references, never display labels. Cache-Control no-store. Tariff token rates are exact nanounits per million tokens; minimum and request fees are exact currency nanounits. Empty valid workspace returns an empty page.

**Supported scope:** implemented
