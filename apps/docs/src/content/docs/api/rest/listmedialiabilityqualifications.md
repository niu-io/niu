---
title: "List immutable route media liability qualifications"
description: "GET /api/v1/providers/{supplier}/offers/{offer}/media-liability-bounds"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/providers/{supplier}/offers/{offer}/media-liability-bounds`

Explicit platform administration only. Ordinary customer and Provider memberships do not grant access. Liability qualifications are finite, immutable maximum billed quantities tied to exact currently approved Provider offer, credential/model/schema revisions, dimensions and meter; they contain no purchase or selling price and must be supported by explicit evidence. Video output estimates are not liability evidence. Publication alone does not authorize dispatch. UUIDs are API references, never display labels. Exact epoch times and versions are decimal integer strings. Identical idempotent retries preserve the original result; changed intent or stale versions conflict. Revocation affects future admission, never rewrites already pinned jobs. Reads use no-store.

Operation: `listMediaLiabilityQualifications`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/providers/{supplier}/offers/{offer}/media-liability-bounds" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
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

### after

Location: **query**. Optional.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 50
}
```

## Request body

No request body is declared.

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
      "type": "array",
      "items": {
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
          },
          "current_version": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
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
            "type": "string"
          },
          "effective_from": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "effective_until": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "revocation_effective_until": {
            "type": [
              "string",
              "null"
            ]
          },
          "reason": {
            "type": "string"
          },
          "actor_kind": {
            "type": "string",
            "enum": [
              "installation",
              "operator"
            ]
          },
          "actor_operator_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "revocation_revision": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "revocation_reason": {
            "type": [
              "string",
              "null"
            ]
          },
          "revocation_actor_kind": {
            "type": [
              "string",
              "null"
            ],
            "enum": [
              "installation",
              "operator",
              null
            ]
          },
          "revocation_actor_operator_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "revocation_created_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          }
        },
        "required": [
          "qualification_id",
          "revision",
          "version",
          "current_version",
          "identity",
          "maximum_quantity",
          "evidence_revision",
          "evidence_sha256",
          "effective_from",
          "effective_until",
          "revocation_effective_until",
          "reason",
          "actor_kind",
          "actor_operator_id",
          "created_at",
          "revocation_revision",
          "revocation_reason",
          "revocation_actor_kind",
          "revocation_actor_operator_id",
          "revocation_created_at"
        ]
      }
    },
    "next_after": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    }
  },
  "required": [
    "data",
    "next_after"
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
