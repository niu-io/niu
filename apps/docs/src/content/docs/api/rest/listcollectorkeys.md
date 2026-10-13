---
title: "List scoped collector credential metadata"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/collector-keys"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/collector-keys`

Lists collector names, purposes, expiry and status without returning secrets or token hashes.

Operation: `listCollectorKeys`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "adminBearerAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/collector-keys" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
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

### purpose

Location: **query**. Optional.

```json
{
  "type": "string",
  "enum": [
    "quota",
    "execution"
  ]
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Collector metadata in this project only.

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
          "id",
          "name",
          "purpose",
          "created_at_ms",
          "expires_at_ms",
          "revoked",
          "expired"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "name": {
            "type": "string",
            "maxLength": 200
          },
          "purpose": {
            "type": "string",
            "enum": [
              "quota",
              "execution"
            ]
          },
          "created_at_ms": {
            "type": "integer"
          },
          "expires_at_ms": {
            "type": "integer"
          },
          "revoked": {
            "type": "boolean"
          },
          "expired": {
            "type": "boolean"
          }
        }
      }
    }
  }
}
```

### HTTP 401

Administrator authentication required.

### HTTP 403

Session does not have read access to this project.

## Behavior and supported scope

Lists collector names, purposes, expiry and status without returning secrets or token hashes.
