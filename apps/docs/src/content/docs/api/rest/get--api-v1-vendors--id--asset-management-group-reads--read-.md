---
title: "Recover an encrypted ordinary group read result"
description: "GET /api/v1/vendors/{id}/asset-management/group-reads/{read}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/vendors/{id}/asset-management/group-reads/{read}`

Platform administrator only. No upstream request. Requires the original read grant, account and credential revisions to remain current. Returns only retained descriptive fields, with Cache-Control no-store; absent, pending, failed, expired, deleted or revoked results return 404. Retention is 24 hours from completion. Backup retention remains an operational responsibility.

Operation: `get--api-v1-vendors--id--asset-management-group-reads--read-`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/vendors/{id}/asset-management/group-reads/{read}" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  --url-query 'organization_id=<ORGANIZATION_ID>' \
  --url-query 'project_id=<PROJECT_ID>'
```

## Parameters

### id

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### read

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### organization_id

Location: **query**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### project_id

Location: **query**. **Required.** Workspace routing identifier.

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

Retained descriptive result.

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
        "read_id",
        "name",
        "description",
        "created_at",
        "updated_at"
      ],
      "properties": {
        "read_id": {
          "type": "string",
          "format": "uuid"
        },
        "name": {
          "type": "string"
        },
        "description": {
          "type": [
            "string",
            "null"
          ]
        },
        "created_at": {
          "type": "string",
          "format": "date-time"
        },
        "updated_at": {
          "type": "string",
          "format": "date-time"
        }
      }
    }
  }
}
```

### HTTP 401

Authentication required.

### HTTP 403

Platform administrator required.

### HTTP 404

No currently authorized retained result.

### HTTP 503

Decryption or storage unavailable.

## Behavior and supported scope

Platform administrator only. No upstream request. Requires the original read grant, account and credential revisions to remain current. Returns only retained descriptive fields, with Cache-Control no-store; absent, pending, failed, expired, deleted or revoked results return 404. Retention is 24 hours from completion. Backup retention remains an operational responsibility.
