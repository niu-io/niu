---
title: "Publish an evidenced route media liability bound"
description: "POST /api/v1/providers/{supplier}/offers/{offer}/media-liability-bounds"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/providers/{supplier}/offers/{offer}/media-liability-bounds`

Explicit platform administration only. Ordinary customer and Provider memberships do not grant access. Liability qualifications are finite, immutable maximum billed quantities tied to exact currently approved Provider offer, credential/model/schema revisions, dimensions and meter; they contain no purchase or selling price and must be supported by explicit evidence. Video output estimates are not liability evidence. Publication alone does not authorize dispatch. UUIDs are API references, never display labels. Exact epoch times and versions are decimal integer strings. Identical idempotent retries preserve the original result; changed intent or stale versions conflict. Revocation affects future admission, never rewrites already pinned jobs. Reads use no-store.

Operation: `publishMediaLiabilityQualification`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/providers/{supplier}/offers/{offer}/media-liability-bounds" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### supplier

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### offer

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
    "identity": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "supplier_id": {
          "type": "string",
          "format": "uuid"
        },
        "offer_id": {
          "type": "string",
          "format": "uuid"
        },
        "offer_revision": {
          "type": "string",
          "format": "uuid"
        },
        "vendor_id": {
          "type": "string",
          "format": "uuid"
        },
        "vendor_revision": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "model_alias": {
          "type": "string"
        },
        "model_revision": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "schema_revision": {
          "type": "string"
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
        }
      },
      "required": [
        "supplier_id",
        "offer_id",
        "offer_revision",
        "vendor_id",
        "vendor_revision",
        "model_alias",
        "model_revision",
        "schema_revision",
        "dimensions",
        "meter"
      ]
    },
    "maximum_quantity": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "numerator": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "denominator": {
          "type": "string",
          "pattern": "^[0-9]+$"
        }
      },
      "required": [
        "numerator",
        "denominator"
      ]
    },
    "evidence_revision": {
      "type": "string"
    },
    "evidence_sha256": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "effective_from": {
      "type": "string",
      "pattern": "^[0-9]+$"
    },
    "effective_until": {
      "type": "string",
      "pattern": "^[0-9]+$"
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
    "identity",
    "maximum_quantity",
    "evidence_revision",
    "evidence_sha256",
    "effective_from",
    "effective_until",
    "expected_version",
    "idempotency_key",
    "reason"
  ]
}
```

## Responses

### HTTP 200

Committed qualification change or paginated immutable history

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
        "qualification_id": {
          "type": "string",
          "format": "uuid"
        },
        "revision": {
          "type": "string",
          "format": "uuid"
        },
        "version": {
          "type": "string",
          "pattern": "^[0-9]+$"
        }
      },
      "required": [
        "qualification_id",
        "revision",
        "version"
      ]
    }
  },
  "required": [
    "data"
  ]
}
```

### HTTP 400

Invalid identity, exact quantity, finite interval, evidence or pagination

### HTTP 401

Authentication required

### HTTP 403

Explicit platform administration required

### HTTP 409

Stale version, conflicting idempotency/interval or unavailable current qualified offer

## Behavior and supported scope

Explicit platform administration only. Ordinary customer and Provider memberships do not grant access. Liability qualifications are finite, immutable maximum billed quantities tied to exact currently approved Provider offer, credential/model/schema revisions, dimensions and meter; they contain no purchase or selling price and must be supported by explicit evidence. Video output estimates are not liability evidence. Publication alone does not authorize dispatch. UUIDs are API references, never display labels. Exact epoch times and versions are decimal integer strings. Identical idempotent retries preserve the original result; changed intent or stale versions conflict. Revocation affects future admission, never rewrites already pinned jobs. Reads use no-store.

**Supported scope:** implemented
