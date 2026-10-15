---
title: "Recover one encrypted asset lookup result"
description: "GET /api/v1/vendors/{id}/asset-management/lookups/{lookup}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/vendors/{id}/asset-management/lookups/{lookup}`

Platform administrator only. Requires exact original grants/account/credentials and unexpired retained content. Authenticated workspace/lookup context; safe validated asset fields only. No upstream request, URL, upstream identity, raw error or billing mutation. Cache-Control no-store. Source listing and lookup results have independent retention domains.

Operation: `get--api-v1-vendors--id--asset-management-lookups--lookup-`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/vendors/{id}/asset-management/lookups/{lookup}" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
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

### lookup

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

Location: **query**. **Required.**

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

Safe retained lookup details.

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
      "additionalProperties": false,
      "required": [
        "lookup_id",
        "asset"
      ],
      "properties": {
        "lookup_id": {
          "type": "string",
          "format": "uuid"
        },
        "asset": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "name",
            "status",
            "asset_type",
            "created_at",
            "updated_at",
            "last_inference_at"
          ],
          "properties": {
            "name": {
              "type": "string",
              "maxLength": 64
            },
            "status": {
              "type": "string",
              "enum": [
                "Active",
                "Processing",
                "Failed"
              ]
            },
            "asset_type": {
              "type": "string",
              "enum": [
                "Image",
                "Video",
                "Audio"
              ]
            },
            "created_at": {
              "type": "string",
              "format": "date-time"
            },
            "updated_at": {
              "type": "string",
              "format": "date-time"
            },
            "last_inference_at": {
              "type": [
                "string",
                "null"
              ],
              "format": "date-time"
            }
          }
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

Missing, expired, erased, revoked or out-of-scope result.

### HTTP 503

Safe decryption or validation failure.

## Behavior and supported scope

Platform administrator only. Requires exact original grants/account/credentials and unexpired retained content. Authenticated workspace/lookup context; safe validated asset fields only. No upstream request, URL, upstream identity, raw error or billing mutation. Cache-Control no-store. Source listing and lookup results have independent retention domains.
