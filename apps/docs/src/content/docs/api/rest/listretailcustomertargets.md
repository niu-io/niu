---
title: "List named companies for customer-specific promotions"
description: "GET /api/v1/pricing/customers"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/pricing/customers`

Explicit platform administration only, independent of ordinary company membership. Includes companies without workspaces or currency accounts. Names, company creation timestamps for distinguishing repeated names, and routing-only company references; no balances, payment details, request content, Provider costs or credentials. UUID keyset order; default 50, maximum 100 companies. Pass next_after unchanged; missing cursor returns 409. Each page shares one bounded read snapshot; separate pages do not, so refresh for concurrent inserts before the cursor. No organization, workspace, account or policy is created. Discovery is not selling or spending authorization. Cache-Control no-store.

Operation: `listRetailCustomerTargets`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/pricing/customers" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
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

Named company page without financial data

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
      "items": {
        "type": "object",
        "required": [
          "organization_id",
          "organization_name",
          "created_at"
        ],
        "properties": {
          "organization_id": {
            "type": "string",
            "format": "uuid"
          },
          "organization_name": {
            "type": "string"
          },
          "created_at": {
            "type": "string",
            "format": "date-time",
            "description": "Company creation time; not a billing or eligibility event."
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

Invalid query or page size

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 409

Missing company cursor

## Behavior and supported scope

Explicit platform administration only, independent of ordinary company membership. Includes companies without workspaces or currency accounts. Names, company creation timestamps for distinguishing repeated names, and routing-only company references; no balances, payment details, request content, Provider costs or credentials. UUID keyset order; default 50, maximum 100 companies. Pass next_after unchanged; missing cursor returns 409. Each page shares one bounded read snapshot; separate pages do not, so refresh for concurrent inserts before the cursor. No organization, workspace, account or policy is created. Discovery is not selling or spending authorization. Cache-Control no-store.

**Supported scope:** implemented
