---
title: "Set workspace media selling-price enrollment"
description: "POST /api/v1/organizations/{organization}/projects/{project}/billing/media-retail-price-enrollment"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/projects/{project}/billing/media-retail-price-enrollment`

Exact workspace/media dimensions/meter identity; currency follows the enrolled price. Platform administration is required for changes. Reads require this workspace authority or platform administration and reveal only its own effective selling price. No procurement or other customer promotions are returned. price_id must be explicitly present: null restores legacy media-card selection for future operations. The published media price must exactly match dimensions and meter and have an existing customer currency account. No balance, credit, route, qualification or operation is created. expected_version is zero initially; exact idempotent retries preserve their original outcome, changed reuse and stale versions conflict. Read effective_price is advisory, not a pinned task price or dispatch qualification. UTC epoch times and amounts are exact strings. Cache-Control: no-store for reads. Video admission reselects at a shared database time and atomically pins customer/Provider prices, independently qualified quantity, provenance and funds. Enrolling a price alone does not enable generation; exact current qualified supply and a supported route remain required. Existing task prices are not reselected after admission.

Operation: `setRetailMediaEnrollment`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/billing/media-retail-price-enrollment" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "dimensions": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "model": {
          "type": "string"
        },
        "channel": {
          "type": "string"
        },
        "resolution": {
          "type": "string"
        },
        "reference_video": {
          "type": "boolean"
        }
      },
      "required": [
        "model",
        "channel",
        "resolution",
        "reference_video"
      ]
    },
    "meter": {
      "type": "string"
    },
    "price_id": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    },
    "expected_version": {
      "type": "string",
      "pattern": "^[0-9]+$"
    },
    "idempotency_key": {
      "type": "string",
      "format": "uuid"
    },
    "reason": {
      "type": "string"
    }
  },
  "required": [
    "dimensions",
    "meter",
    "price_id",
    "expected_version",
    "idempotency_key",
    "reason"
  ]
}
```

## Responses

### HTTP 200

Committed configuration or own advisory read

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "data": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "revision": {
          "type": "string",
          "format": "uuid"
        },
        "version": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "dimensions": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "model": {
              "type": "string"
            },
            "channel": {
              "type": "string"
            },
            "resolution": {
              "type": "string"
            },
            "reference_video": {
              "type": "boolean"
            }
          },
          "required": [
            "model",
            "channel",
            "resolution",
            "reference_video"
          ]
        },
        "meter": {
          "type": "string"
        },
        "price_id": {
          "type": [
            "string",
            "null"
          ],
          "format": "uuid"
        }
      },
      "required": [
        "revision",
        "version",
        "dimensions",
        "meter",
        "price_id"
      ]
    }
  },
  "required": [
    "data"
  ]
}
```

### HTTP 400

Invalid exact identity, reason or version

### HTTP 401

Authentication required

### HTTP 403

Explicit platform administration required for changes

### HTTP 404

Workspace outside authority

### HTTP 409

Stale version, conflicting key, mismatched price or absent existing currency account

## Behavior and supported scope

Exact workspace/media dimensions/meter identity; currency follows the enrolled price. Platform administration is required for changes. Reads require this workspace authority or platform administration and reveal only its own effective selling price. No procurement or other customer promotions are returned. price_id must be explicitly present: null restores legacy media-card selection for future operations. The published media price must exactly match dimensions and meter and have an existing customer currency account. No balance, credit, route, qualification or operation is created. expected_version is zero initially; exact idempotent retries preserve their original outcome, changed reuse and stale versions conflict. Read effective_price is advisory, not a pinned task price or dispatch qualification. UTC epoch times and amounts are exact strings. Cache-Control: no-store for reads. Video admission reselects at a shared database time and atomically pins customer/Provider prices, independently qualified quantity, provenance and funds. Enrolling a price alone does not enable generation; exact current qualified supply and a supported route remain required. Existing task prices are not reselected after admission.

**Supported scope:** implemented
