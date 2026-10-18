---
title: "Read saved video query observations"
description: "GET /v1/video/jobs/{id}/observations"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/video/jobs/{id}/observations`

Reads immutable, content-free saved query receipts in descending observation-time/receipt order. Reported quantity is not a customer charge or settled usage. Missing/invalid quantities remain explicit; provider timestamps are epoch seconds, not measured transport spans. Does not poll upstream, submit work, reserve funds or mutate financial state. No upstream identity, URL, credential, raw error, cost, procurement price or protocol configuration is returned. Cursor and receipt page share a bounded read-only snapshot (250 ms lock / 2 s statement limits); authorization and whole-request deadlines are separate. Separate pages are live views. Cache-Control no-store.

Operation: `videoQueryObservations`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  },
  {
    "niuApiKeyAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/video/jobs/{id}/observations" \
  -H "Authorization: Bearer $NIU_API_KEY"
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

### after

Location: **query**. Optional.

```json
{
  "type": "string",
  "pattern": "^[a-fA-F0-9]{64}$"
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

Saved observations only; empty data means no saved query receipt in this range.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data",
    "next_cursor"
  ],
  "properties": {
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "cursor",
          "observed_at_ms",
          "meter",
          "status",
          "quantity",
          "provider_times"
        ],
        "properties": {
          "cursor": {
            "type": "string",
            "pattern": "^[a-f0-9]{64}$",
            "description": "Internal continuation reference; never a product label."
          },
          "observed_at_ms": {
            "type": "integer",
            "format": "int64"
          },
          "meter": {
            "type": "string"
          },
          "status": {
            "type": "string",
            "enum": [
              "queued",
              "running",
              "succeeded",
              "failed",
              "cancelled",
              "expired",
              "unknown"
            ]
          },
          "quantity": {
            "oneOf": [
              {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "state"
                ],
                "properties": {
                  "state": {
                    "type": "string",
                    "enum": [
                      "missing",
                      "invalid"
                    ]
                  }
                }
              },
              {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "state",
                  "value"
                ],
                "properties": {
                  "state": {
                    "type": "string",
                    "const": "reported"
                  },
                  "value": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]*)$"
                  }
                }
              }
            ]
          },
          "provider_times": {
            "oneOf": [
              {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "state"
                ],
                "properties": {
                  "state": {
                    "type": "string",
                    "enum": [
                      "missing",
                      "invalid"
                    ]
                  }
                }
              },
              {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "state",
                  "created_at",
                  "updated_at"
                ],
                "properties": {
                  "state": {
                    "type": "string",
                    "const": "reported"
                  },
                  "created_at": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]*)$"
                  },
                  "updated_at": {
                    "type": "string",
                    "pattern": "^(0|[1-9][0-9]*)$"
                  }
                }
              }
            ]
          }
        }
      }
    },
    "next_cursor": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[a-f0-9]{64}$"
    }
  }
}
```

### HTTP 400

Malformed cursor or page size.

### HTTP 401

Invalid, expired or revoked credential.

### HTTP 403

Source or workspace permission denied.

### HTTP 404

Unknown job or outside authorized workspace/model scope.

### HTTP 409

Cursor absent from this job scope.

### HTTP 503

Storage read unavailable; never empty successful history.

## Behavior and supported scope

Reads immutable, content-free saved query receipts in descending observation-time/receipt order. Reported quantity is not a customer charge or settled usage. Missing/invalid quantities remain explicit; provider timestamps are epoch seconds, not measured transport spans. Does not poll upstream, submit work, reserve funds or mutate financial state. No upstream identity, URL, credential, raw error, cost, procurement price or protocol configuration is returned. Cursor and receipt page share a bounded read-only snapshot (250 ms lock / 2 s statement limits); authorization and whole-request deadlines are separate. Separate pages are live views. Cache-Control no-store.

**Supported scope:** implemented
