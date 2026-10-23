---
title: "Read a recorded gateway request"
description: "GET /api/v1/organizations/{organization}/projects/{project}/requests/{attempt}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/requests/{attempt}`

Scoped workspace read access required. Accepts a durable run reference or a legacy attempt UUID. Returns persisted metadata, usage, timing, safe failure classification and customer charges without prompts, response bodies or Provider procurement costs. Missing or foreign attempts return 404. Unknown values remain null. Legacy correlation fields are opaque metadata. Does not contact the upstream service or change billing. Reporting reads use a one-second database lock timeout and a five-second timeout per SQL statement. Timeout returns a sanitized 503 error, never partial results; these are not whole-request deadlines.

Operation: `getGatewayRequest`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/requests/{attempt}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
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

### attempt

Location: **path**. **Required.**

```json
{
  "type": "string",
  "description": "Durable run reference or legacy attempt UUID"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Saved request metadata. Cache-Control: no-store.

Response headers:

```json
{
  "Cache-Control": {
    "schema": {
      "type": "string",
      "const": "no-store"
    }
  }
}
```

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
        "attempt_id",
        "reference",
        "operation_id",
        "api_key_id",
        "key_name",
        "task_id",
        "provider_model",
        "output_guardrail_outcome",
        "customer_charge_currency",
        "task_evidence",
        "request_kind",
        "model",
        "created_at",
        "execution",
        "usage_confidence",
        "customer_charge_status",
        "dispatched_at",
        "completed_at",
        "duration_ms",
        "prompt_tokens",
        "completion_tokens",
        "cache_write_input_tokens",
        "cached_input_tokens",
        "reasoning_output_tokens",
        "customer_charge_nanos",
        "timing",
        "failure",
        "finish_reasons"
      ],
      "properties": {
        "reference": {
          "type": "string",
          "description": "Stable public run reference for customer-facing links"
        },
        "attempt_id": {
          "type": "string",
          "format": "uuid"
        },
        "operation_id": {
          "type": "string",
          "format": "uuid"
        },
        "retry": {
          "type": [
            "object",
            "null"
          ],
          "description": "Durable bounded retry policy and chain position; null for requests outside this policy. Internal correlation identifiers must not be displayed in product UI.",
          "properties": {
            "ordinal": {
              "type": "integer",
              "minimum": 1,
              "maximum": 2
            },
            "predecessor_attempt_id": {
              "type": [
                "string",
                "null"
              ],
              "format": "uuid"
            },
            "maximum_attempts": {
              "type": "integer",
              "const": 2
            },
            "policy_revision": {
              "type": "string"
            }
          },
          "required": [
            "ordinal",
            "predecessor_attempt_id",
            "maximum_attempts",
            "policy_revision"
          ]
        },
        "api_key_id": {
          "type": [
            "string",
            "null"
          ],
          "format": "uuid"
        },
        "key_name": {
          "type": [
            "string",
            "null"
          ]
        },
        "task_id": {
          "type": [
            "string",
            "null"
          ]
        },
        "provider_model": {
          "type": [
            "string",
            "null"
          ]
        },
        "output_guardrail_outcome": {
          "type": [
            "string",
            "null"
          ]
        },
        "customer_charge_currency": {
          "type": [
            "string",
            "null"
          ]
        },
        "task_evidence": {
          "description": "Legacy optional correlation metadata; not request content or a complete agent trace."
        },
        "request_kind": {
          "type": "string"
        },
        "model": {
          "type": "string"
        },
        "created_at": {
          "type": "string"
        },
        "execution": {
          "type": "string"
        },
        "usage_confidence": {
          "type": "string"
        },
        "customer_charge_status": {
          "type": "string"
        },
        "dispatched_at": {
          "type": [
            "string",
            "null"
          ],
          "format": "date-time"
        },
        "completed_at": {
          "type": [
            "string",
            "null"
          ],
          "format": "date-time"
        },
        "duration_ms": {
          "type": [
            "integer",
            "null"
          ],
          "description": "Legacy dispatch-to-completion interval, not complete gateway latency. Null when completion was first confirmed by supplemental reconciliation; confirmation delay is not generation latency. Use timing for independently observed delivery measurements."
        },
        "prompt_tokens": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[0-9]+$"
        },
        "completion_tokens": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[0-9]+$"
        },
        "cache_write_input_tokens": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[0-9]+$"
        },
        "cached_input_tokens": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[0-9]+$"
        },
        "reasoning_output_tokens": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[0-9]+$"
        },
        "customer_charge_nanos": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[0-9]+$",
          "description": "Customer retail charge only. Null is unknown or absent, never an upstream expense fallback."
        },
        "timing": {
          "type": [
            "object",
            "null"
          ],
          "required": [
            "dispatch_ms",
            "headers_ms",
            "first_output_ms",
            "http_status",
            "total_ms",
            "complete"
          ],
          "properties": {
            "dispatch_ms": {
              "type": [
                "integer",
                "null"
              ]
            },
            "headers_ms": {
              "type": [
                "integer",
                "null"
              ]
            },
            "first_output_ms": {
              "type": [
                "integer",
                "null"
              ]
            },
            "http_status": {
              "type": [
                "integer",
                "null"
              ]
            },
            "total_ms": {
              "type": "integer"
            },
            "complete": {
              "type": "boolean"
            }
          }
        },
        "admission_denial": {
          "description": "Recorded Gateway request-rate rejection for a retained unsent attempt. Null includes historical records and unavailable diagnostics. The captured requested key name is provenance, not dispatch or billing authority. This is independent of upstream failure evidence.",
          "oneOf": [
            {
              "type": "null"
            },
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "kind",
                "http_status",
                "requested_key_name",
                "key_name_source",
                "recorded_at"
              ],
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": [
                    "key_request_rate_disabled",
                    "key_request_rate_exceeded"
                  ]
                },
                "http_status": {
                  "type": "integer",
                  "enum": [
                    429
                  ],
                  "description": "Gateway admission HTTP status, never an upstream status."
                },
                "requested_key_name": {
                  "type": "string",
                  "description": "Name captured from the authorized key at admission; never inferred from current configuration."
                },
                "key_name_source": {
                  "type": "string",
                  "enum": [
                    "captured_at_admission"
                  ]
                },
                "recorded_at": {
                  "type": "string",
                  "format": "date-time"
                }
              }
            }
          ]
        },
        "failure": {
          "type": [
            "object",
            "null"
          ],
          "required": [
            "kind",
            "upstream_http_status"
          ],
          "properties": {
            "kind": {
              "type": "string"
            },
            "upstream_http_status": {
              "type": [
                "integer",
                "null"
              ]
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
              "description": "Observed transport stage, not execution certainty. Connection does not distinguish DNS/TCP/TLS; historical unknown stays null."
            }
          }
        },
        "finish_reasons": {
          "type": [
            "array",
            "null"
          ],
          "items": {
            "type": "object",
            "required": [
              "index",
              "reason"
            ],
            "properties": {
              "index": {
                "type": "integer"
              },
              "reason": {
                "type": "string"
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

Authentication required

### HTTP 403

Workspace read permission denied

### HTTP 404

Workspace or request unavailable in this scope

## Behavior and supported scope

Scoped workspace read access required. Accepts a durable run reference or a legacy attempt UUID. Returns persisted metadata, usage, timing, safe failure classification and customer charges without prompts, response bodies or Provider procurement costs. Missing or foreign attempts return 404. Unknown values remain null. Legacy correlation fields are opaque metadata. Does not contact the upstream service or change billing. Reporting reads use a one-second database lock timeout and a five-second timeout per SQL statement. Timeout returns a sanitized 503 error, never partial results; these are not whole-request deadlines.

**Supported scope:** implemented
