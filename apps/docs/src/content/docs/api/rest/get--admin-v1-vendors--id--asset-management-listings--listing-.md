---
title: "Recover a retained ordinary asset listing locally"
description: "GET /admin/v1/vendors/{id}/asset-management/listings/{listing}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/vendors/{id}/asset-management/listings/{listing}`

Platform administrator only; exact original qualification and account/credential binding must remain current. No upstream call. Pending, failed, missing, deleted, expired and revoked results are unavailable. Successful response is no-store.

Operation: `get--admin-v1-vendors--id--asset-management-listings--listing-`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/vendors/{id}/asset-management/listings/{listing}" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
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

### listing

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

Retained validated page.

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
        "listing_id",
        "items",
        "has_more"
      ],
      "properties": {
        "listing_id": {
          "type": "string",
          "format": "uuid"
        },
        "has_more": {
          "type": "boolean",
          "description": "Additional upstream pages were observed; continue using this listing as previous_listing_id within the retained, authorized chain."
        },
        "items": {
          "type": "array",
          "maxItems": 100,
          "items": {
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
}
```

### HTTP 401

Authentication required.

### HTTP 403

Platform administrator required.

### HTTP 404

Retained page unavailable.

### HTTP 503

Retained page cannot be decoded.

## Behavior and supported scope

Platform administrator only; exact original qualification and account/credential binding must remain current. No upstream call. Pending, failed, missing, deleted, expired and revoked results are unavailable. Successful response is no-store.
