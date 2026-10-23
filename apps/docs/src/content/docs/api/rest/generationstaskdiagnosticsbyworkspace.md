---
title: "Read saved customer billing and transport diagnostics"
description: "GET /api/v1/workspaces/{workspace}/tasks/{task}/diagnostics"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/workspaces/{workspace}/tasks/{task}/diagnostics`

Current dashboard workspace Read authorizes persisted diagnostics independently of the original inference key expiry, revocation or model grants. Actor-private tasks belonging to another actor are 404. Billing is customer-only; owner-funded jobs retain null customer charges and never expose procurement costs. Billing and measured transport/lifecycle observations share one bounded read-only snapshot. This GET never contacts a Provider, polls, refreshes, retries, submits or settles a task. Errors are explicit; no successful empty result hides a storage failure. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

Operation: `generationsTaskDiagnosticsByWorkspace`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/workspaces/{workspace}/tasks/{task}/diagnostics" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### workspace

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### task

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

Persisted customer diagnostics

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "billing",
    "timings"
  ],
  "properties": {
    "billing": {
      "type": [
        "object",
        "null"
      ],
      "additionalProperties": false,
      "description": "Saved estimated quantity priced using the original customer tariff. Neither confirmed usage, maximum liability nor a final charge. Owner-funded or unpriceable amounts remain null.",
      "required": [
        "meter",
        "quantity",
        "provenance",
        "currency",
        "amount_nanos"
      ],
      "properties": {
        "meter": {
          "type": "string"
        },
        "quantity": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "numerator",
            "denominator"
          ],
          "properties": {
            "numerator": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "denominator": {
              "type": "string",
              "pattern": "^[1-9][0-9]*$"
            }
          }
        },
        "provenance": {
          "type": "string",
          "enum": [
            "Estimate"
          ]
        },
        "currency": {
          "type": [
            "string",
            "null"
          ]
        },
        "amount_nanos": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[0-9]+$"
        }
      }
    },
    "timings": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "data",
        "has_more",
        "lifecycle"
      ],
      "properties": {
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
              "outcome",
              "upstream_http_status",
              "upstream_error_code",
              "upstream_request_id"
            ],
            "properties": {
              "phase": {
                "type": "string",
                "enum": [
                  "submission",
                  "query",
                  "result"
                ]
              },
              "started_unix_ms": {
                "type": "integer",
                "minimum": 0
              },
              "elapsed_ms": {
                "type": "integer",
                "minimum": 0
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
                ]
              },
              "upstream_error_code": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "upstream_request_id": {
                "type": [
                  "string",
                  "null"
                ]
              }
            }
          }
        },
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
        }
      }
    }
  }
}
```

### HTTP 401

Invalid dashboard session

### HTTP 403

Workspace Read denied

### HTTP 404

Saved Video task missing or actor-private

### HTTP 503

Saved diagnostics unavailable

## Behavior and supported scope

Current dashboard workspace Read authorizes persisted diagnostics independently of the original inference key expiry, revocation or model grants. Actor-private tasks belonging to another actor are 404. Billing is customer-only; owner-funded jobs retain null customer charges and never expose procurement costs. Billing and measured transport/lifecycle observations share one bounded read-only snapshot. This GET never contacts a Provider, polls, refreshes, retries, submits or settles a task. Errors are explicit; no successful empty result hides a storage failure. The server resolves the organization from the authorized workspace. Foreign or missing workspaces return 404. The compatibility route remains supported with identical payload, owner, revision and replay semantics.

**Supported scope:** implemented
