---
title: "Read measured gateway video transport spans"
description: "GET /v1/video/jobs/{id}/timings"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/video/jobs/{id}/timings`

Same current workspace/model authorization as job reads. Returns at most the latest 100 spans in chronological order with explicit truncation. Submission/query network intervals are distinct from Provider queue/run timestamps; unavailable is a transport outcome, not a generation failure or refund. No upstream references or internal span IDs are exposed.

Operation: `retrieveVideoTransportTimings`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/video/jobs/{id}/timings" \
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

## Request body

No request body is declared.

## Responses

### HTTP 200

Measured spans; missing observations are not invented

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data",
    "has_more"
  ],
  "properties": {
    "lifecycle": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "source",
        "submitted_unix_ms",
        "observations",
        "conflicting_terminal"
      ],
      "properties": {
        "source": {
          "type": "string",
          "enum": [
            "gateway_observation"
          ]
        },
        "submitted_unix_ms": {
          "type": [
            "integer",
            "null"
          ]
        },
        "conflicting_terminal": {
          "type": "boolean"
        },
        "observations": {
          "type": "array",
          "maxItems": 5,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "status",
              "observed_unix_ms"
            ],
            "properties": {
              "status": {
                "type": "string",
                "enum": [
                  "queued",
                  "running",
                  "succeeded",
                  "failed",
                  "unknown"
                ]
              },
              "observed_unix_ms": {
                "type": "integer"
              }
            }
          }
        }
      }
    },
    "has_more": {
      "type": "boolean"
    },
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "phase",
          "started_unix_ms",
          "elapsed_ms",
          "outcome"
        ],
        "properties": {
          "phase": {
            "type": "string",
            "enum": [
              "submission",
              "query",
              "result"
            ],
            "description": "Result measures retrieval transport only; received does not imply client delivery or another generation."
          },
          "started_unix_ms": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "elapsed_ms": {
            "type": "integer",
            "minimum": 0,
            "maximum": 120000
          },
          "outcome": {
            "type": "string",
            "enum": [
              "received",
              "unavailable"
            ]
          },
          "upstream_http_status": {
            "type": [
              "integer",
              "null"
            ],
            "minimum": 100,
            "maximum": 599,
            "description": "Safe HTTP failure status only; null for historical or unclassified outcomes. Does not prove generation nonexecution or authorize a refund."
          },
          "upstream_error_code": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 128,
            "description": "Bounded observed Provider error code; no response message or body."
          },
          "upstream_request_id": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 200,
            "description": "Bounded observed Provider correlation identifier for diagnostics."
          },
          "transport_phase": {
            "type": [
              "string",
              "null"
            ],
            "enum": [
              "connection",
              "request",
              null
            ],
            "description": "Observed stage only; historical unknown remains null and does not prove nonexecution."
          }
        }
      }
    }
  }
}
```

### HTTP 401

Invalid credential

### HTTP 404

Missing job or workspace/model access denied

## Behavior and supported scope

Same current workspace/model authorization as job reads. Returns at most the latest 100 spans in chronological order with explicit truncation. Submission/query network intervals are distinct from Provider queue/run timestamps; unavailable is a transport outcome, not a generation failure or refund. No upstream references or internal span IDs are exposed.
