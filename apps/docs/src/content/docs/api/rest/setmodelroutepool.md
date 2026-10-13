---
title: "Create or revise a model candidate pool"
description: "PUT /admin/v1/model-route-pools"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /admin/v1/model-route-pools`

Platform administration required: installation credentials or an explicitly authorized platform administrator. Ordinary company/workspace ownership does not grant this access. Revisions start at zero for creation. Ownership is immutable. Candidate aliases identify existing credential/model mappings, not nested pools. Personal pools require all candidates owned by that organization; shared pools require nonpersonal priced mappings. Video mappings are rejected. Highest eligible priority wins, with weighted selection within that tier. Chat pools permit at most one successor after a qualified OpenRouter authentication rejection; other failures and uncertain or streamed outcomes do not trigger automatic failover. See the Chat completion contract for exact eligibility and deadline constraints.

Operation: `setModelRoutePool`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/admin/v1/model-route-pools" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

No path, query, or header parameters are declared.

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "alias",
    "organization_id",
    "enabled",
    "expected_revision",
    "candidates"
  ],
  "properties": {
    "alias": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200,
      "pattern": "^[!-~]+$"
    },
    "organization_id": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    },
    "enabled": {
      "type": "boolean"
    },
    "expected_revision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740990
    },
    "candidates": {
      "type": "array",
      "minItems": 1,
      "maxItems": 64,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "alias",
          "priority",
          "weight",
          "enabled"
        ],
        "properties": {
          "alias": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200
          },
          "priority": {
            "type": "integer",
            "minimum": -1000,
            "maximum": 1000
          },
          "weight": {
            "type": "integer",
            "minimum": 1,
            "maximum": 10000
          },
          "enabled": {
            "type": "boolean"
          }
        }
      }
    }
  }
}
```

## Responses

### HTTP 200

Saved revision; changes apply to later admission and stale snapshots reject before dispatch

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
        "revision"
      ],
      "properties": {
        "revision": {
          "type": "integer",
          "minimum": 1,
          "maximum": 9007199254740991
        }
      }
    }
  }
}
```

### HTTP 400

Invalid candidates, bounds, ownership, reserved alias or unsupported mapping

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 409

Stale revision or attempted ownership change

### HTTP 422

Malformed body schema or unknown fields; framework rejection may use plain text.

## Behavior and supported scope

Platform administration required: installation credentials or an explicitly authorized platform administrator. Ordinary company/workspace ownership does not grant this access. Revisions start at zero for creation. Ownership is immutable. Candidate aliases identify existing credential/model mappings, not nested pools. Personal pools require all candidates owned by that organization; shared pools require nonpersonal priced mappings. Video mappings are rejected. Highest eligible priority wins, with weighted selection within that tier. Chat pools permit at most one successor after a qualified OpenRouter authentication rejection; other failures and uncertain or streamed outcomes do not trigger automatic failover. See the Chat completion contract for exact eligibility and deadline constraints.

**Supported scope:** implemented
