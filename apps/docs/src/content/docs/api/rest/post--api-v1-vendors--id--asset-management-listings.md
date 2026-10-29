---
title: "List one bounded page of assets in a saved ordinary group"
description: "POST /api/v1/vendors/{id}/asset-management/listings"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/vendors/{id}/asset-management/listings`

Platform administrator only. Requires a separate current ListAssets grant and the successful group's original workspace/account/credential binding. Claims listing_id once before dispatch; duplicates never replay. Four listings can execute concurrently, with 30-second transport and 35-second outer transport deadlines. Claimed work persists after caller disconnect. Validated snapshots are encrypted for 24 hours and recovered without another upstream call. Responses omit upstream identities, URLs, cursors and raw errors; Active is an observation, not reuse authorization. Optional previous_listing_id continues a retained parent through its exact original grant, with unchanged scope and page size. Each parent permits one child; chains are bounded to 100 pages. Raw cursors are never accepted. has_more never proves a complete inventory. No billing mutation.

Operation: `post--api-v1-vendors--id--asset-management-listings`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/vendors/{id}/asset-management/listings" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "organization_id",
    "project_id",
    "intent_id",
    "listing_id",
    "maximum_items"
  ],
  "properties": {
    "organization_id": {
      "type": "string",
      "format": "uuid"
    },
    "project_id": {
      "type": "string",
      "format": "uuid"
    },
    "intent_id": {
      "type": "string",
      "format": "uuid"
    },
    "listing_id": {
      "type": "string",
      "format": "uuid"
    },
    "maximum_items": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    },
    "previous_listing_id": {
      "type": "string",
      "format": "uuid",
      "description": "Retained parent listing to continue; omit for the first page."
    }
  }
}
```

## Responses

### HTTP 200

Retained validated page; Cache-Control no-store.

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

### HTTP 400

Invalid or changed page size.

### HTTP 401

Authentication required.

### HTTP 403

Platform administrator required or current access revoked.

### HTTP 404

Group missing or outside the exact scope.

### HTTP 409

Qualification missing, identity already claimed, parent already continued or terminal, scope mismatch, or 100-page chain exhausted.

### HTTP 422

Invalid or unsupported request fields.

### HTTP 503

Capacity exhausted or safe transport/persistence failure.

## Behavior and supported scope

Platform administrator only. Requires a separate current ListAssets grant and the successful group's original workspace/account/credential binding. Claims listing_id once before dispatch; duplicates never replay. Four listings can execute concurrently, with 30-second transport and 35-second outer transport deadlines. Claimed work persists after caller disconnect. Validated snapshots are encrypted for 24 hours and recovered without another upstream call. Responses omit upstream identities, URLs, cursors and raw errors; Active is an observation, not reuse authorization. Optional previous_listing_id continues a retained parent through its exact original grant, with unchanged scope and page size. Each parent permits one child; chains are bounded to 100 pages. Raw cursors are never accepted. has_more never proves a complete inventory. No billing mutation.
