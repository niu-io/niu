---
title: "List API key spending limits"
description: "GET /api/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit`

Scoped readers may inspect customer commitments. Rotated keys share the original spending identity. Personal upstream routes do not consume customer funds. No Provider costs or company balance are exposed.

Operation: `listKeySpendingLimits`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit" \
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

## Request body

No request body is declared.

## Responses

### HTTP 200

Account currencies and lifetime key commitments; null limit means unlimited and null revision means never configured.

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
          "currency",
          "limit_nanos",
          "revision",
          "committed_nanos",
          "remaining_nanos"
        ],
        "properties": {
          "currency": {
            "type": "string",
            "pattern": "^[A-Z]{3}$"
          },
          "limit_nanos": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$"
          },
          "revision": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$"
          },
          "committed_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "remaining_nanos": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$",
            "description": "Maximum of cap minus committed customer amount and zero; null for unlimited. This is key allowance only, not company balance or guaranteed admission."
          }
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

Key does not exist in the authorized workspace

## Behavior and supported scope

Scoped readers may inspect customer commitments. Rotated keys share the original spending identity. Personal upstream routes do not consume customer funds. No Provider costs or company balance are exposed.

**Supported scope:** implemented
