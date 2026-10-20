---
title: "Read committed financial recovery progress"
description: "GET /api/v1/platform/financial-recovery"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/platform/financial-recovery`

Platform administrators only. Stages are ordered by name. Null step fields mean no durable worker step has committed since diagnostics were installed. Counts describe the last committed candidate page, not settled rows, total backlog or throughput. A cursor indicates traversal position, not remaining recoverable debt. Zero failures does not establish settlement. Storage failures leave previous committed diagnostics unchanged and are reported separately in worker logs. No attempt IDs, amounts or credentials.

Operation: `getFinancialRecoveryDiagnostics`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/platform/financial-recovery" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Committed stage diagnostics

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "observed_at",
    "data"
  ],
  "properties": {
    "observed_at": {
      "type": "string",
      "format": "date-time"
    },
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "stage",
          "last_step_at",
          "last_candidate_count",
          "last_failure_count",
          "has_cursor"
        ],
        "properties": {
          "stage": {
            "type": "string",
            "enum": [
              "balance_release",
              "customer_charge",
              "customer_media_charge",
              "media_completion",
              "supplier_earning",
              "upstream_cost"
            ]
          },
          "last_step_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "last_candidate_count": {
            "type": [
              "integer",
              "null"
            ],
            "minimum": 0
          },
          "last_failure_count": {
            "type": [
              "integer",
              "null"
            ],
            "minimum": 0
          },
          "has_cursor": {
            "type": "boolean"
          }
        }
      }
    }
  }
}
```

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 503

Storage unavailable

## Behavior and supported scope

Platform administrators only. Stages are ordered by name. Null step fields mean no durable worker step has committed since diagnostics were installed. Counts describe the last committed candidate page, not settled rows, total backlog or throughput. A cursor indicates traversal position, not remaining recoverable debt. Zero failures does not establish settlement. Storage failures leave previous committed diagnostics unchanged and are reported separately in worker logs. No attempt IDs, amounts or credentials.

**Supported scope:** implemented
