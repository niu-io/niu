---
title: "Look up one asset from a retained original-group listing"
description: "POST /api/v1/vendors/{id}/asset-management/lookups"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/vendors/{id}/asset-management/lookups`

Platform administrator only. Requires current original ListAssets and separate GetAsset grants. Accepts a retained listing and zero-based item position, never an upstream identity or URL. Claims lookup_id once before egress. Four lookups execute concurrently without a queue; claimed work persists after caller disconnect. Fixed signed transport is bounded to 1 MiB and 30 seconds, with a 35-second outer deadline. No retries or billing mutation. Returns operational status only; a validated snapshot is separately encrypted for 24 hours and recovered through the saved-result endpoint. Successful transport may observe a Failed or Processing asset and never grants readiness or reuse rights.

Operation: `post--api-v1-vendors--id--asset-management-lookups`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/vendors/{id}/asset-management/lookups" \
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
    "listing_id",
    "lookup_id",
    "item_index"
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
    "listing_id": {
      "type": "string",
      "format": "uuid"
    },
    "lookup_id": {
      "type": "string",
      "format": "uuid"
    },
    "item_index": {
      "type": "integer",
      "minimum": 0,
      "maximum": 99
    }
  }
}
```

## Responses

### HTTP 200

Safe observed status; Cache-Control no-store.

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
        "lookup_id",
        "status",
        "asset_status"
      ],
      "properties": {
        "lookup_id": {
          "type": "string",
          "format": "uuid"
        },
        "status": {
          "type": "string",
          "enum": [
            "succeeded"
          ]
        },
        "asset_status": {
          "type": "string",
          "enum": [
            "Active",
            "Processing",
            "Failed"
          ]
        }
      }
    }
  }
}
```

### HTTP 400

Invalid item position.

### HTTP 401

Authentication required.

### HTTP 403

Platform administrator required.

### HTTP 409

Scope, grant, retained page or item unavailable, or lookup identity already claimed.

### HTTP 422

Unsupported request fields or shape.

### HTTP 503

Capacity exhausted or safe transport/persistence failure.

## Behavior and supported scope

Platform administrator only. Requires current original ListAssets and separate GetAsset grants. Accepts a retained listing and zero-based item position, never an upstream identity or URL. Claims lookup_id once before egress. Four lookups execute concurrently without a queue; claimed work persists after caller disconnect. Fixed signed transport is bounded to 1 MiB and 30 seconds, with a 35-second outer deadline. No retries or billing mutation. Returns operational status only; a validated snapshot is separately encrypted for 24 hours and recovered through the saved-result endpoint. Successful transport may observe a Failed or Processing asset and never grants readiness or reuse rights.
