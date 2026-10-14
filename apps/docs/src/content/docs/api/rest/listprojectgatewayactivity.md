---
title: "Read automatically retained gateway request activity"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/requests"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/requests`

Returns metadata for model attempts admitted by Niu, newest first by default, with the requested sort applied to the whole range. Request and response bodies, prompts and completions are not included. Pages are bounded to at most 100 entries. Pass the previous response's next_cursor as after to read older matching entries; traversal is a live view, not a cross-page snapshot. Optional filters apply to the whole workspace scope. summary totals cover the selected filters independent of page. Rows and summary in one response share a database snapshot. Reporting reads use a one-second database lock timeout and a five-second timeout per SQL statement. Timeout returns a sanitized 503 error, never partial results; these are not whole-request deadlines. An absent task_id means the caller did not supply X-Niu-Task-ID. Missing usage remains unknown. All workspace responses exclude Supplier expenses and platform margins, including for installation administrators. Customer-facing charges and nullable observed request phase timing are included.

Operation: `listProjectGatewayActivity`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/requests" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

### http_status

Location: **query**. Optional. Recorded delivery HTTP status, or unknown when absent; independent of Provider execution.

```json
{
  "type": "string",
  "pattern": "^(unknown|[1-5][0-9]{2})$"
}
```

### sort

Location: **query**. Optional. Full-range order. Known latency/token values precede unknown values; time and ID break ties. Live traversal is not a cross-page snapshot.

```json
{
  "type": "string",
  "enum": [
    "time_desc",
    "time_asc",
    "latency_desc",
    "input_desc",
    "output_desc"
  ],
  "default": "time_desc"
}
```

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

### after

Location: **query**. Optional. Exclusive cursor from the previous page's next_cursor; continue strictly after this attempt in the same sort order; preserve sort and filters across pages.

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

### from_ms

Location: **query**. Optional. Inclusive creation-time lower bound as Unix epoch milliseconds.

```json
{
  "type": "integer",
  "format": "int64"
}
```

### to_ms

Location: **query**. Optional. Exclusive creation-time upper bound as Unix epoch milliseconds.

```json
{
  "type": "integer",
  "format": "int64"
}
```

### model_alias

Location: **query**. Optional. Exact public model alias filter.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 200
}
```

### operation_id

Location: **query**. Optional. Restrict attempts and summaries to one operation within the authorized workspace. Unknown or foreign operations yield an empty result; this does not authorize cross-workspace reads.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### key_id

Location: **query**. Optional. Workspace API key ID filter. Matches the dispatched key or a captured requested key in saved admission-denial evidence while the attempt remains unsent. Does not change billing attribution. Key names and IDs are visible only within the authorized workspace.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### status

Location: **query**. Optional. Exact gateway execution state, or output_withheld for recorded blocked/indeterminate output inspection. delivery_failed selects recorded HTTP errors (400–599). recorded_failure selects persisted upstream failure observations, including errors delivered inside HTTP 200 streams, and saved Gateway admission denials while the attempt remains unsent. Missing failure observations are not inferred from execution uncertainty. Completion at the Provider does not establish successful response delivery.

```json
{
  "type": "string",
  "enum": [
    "not_sent",
    "may_have_executed",
    "confirmed_completed",
    "confirmed_not_executed",
    "output_withheld",
    "delivery_failed",
    "recorded_failure"
  ]
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Gateway activity wrapped in data, nullable next_cursor, and summary. Each entry includes attempt_id, operation_id, optional project api_key_id/key_name and task_id, an optional summary of the latest supplemental execution record for that task, public model alias and nullable provider-reported model, creation/dispatch/completion times, duration_ms, execution status, usage confidence, nullable prompt/completion token counts, and nullable customer charge currency/amount/status and request phase timing. Integer quantities and amounts are decimal strings. Pages follow the requested sort; next_cursor is the last attempt_id when further matching entries remain. summary covers all rows matching the filters, not only the current page.

Response headers:

```json
{
  "Cache-Control": {
    "description": "Request diagnostics must not be cached.",
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
    "data",
    "next_cursor",
    "summary"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "attempt_id",
          "operation_id",
          "api_key_id",
          "key_name",
          "task_evidence",
          "model",
          "provider_model",
          "created_at",
          "execution",
          "output_guardrail_outcome",
          "usage_confidence"
        ],
        "properties": {
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
            ],
            "maxLength": 200
          },
          "task_evidence": {
            "oneOf": [
              {
                "type": "null"
              },
              {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "execution_id",
                  "source",
                  "record_id",
                  "coverage",
                  "outcomes"
                ],
                "properties": {
                  "execution_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Historical correlation reference; external execution imports are no longer supported."
                  },
                  "source": {
                    "type": "string"
                  },
                  "record_id": {
                    "type": "string"
                  },
                  "coverage": {
                    "type": "string",
                    "enum": [
                      "complete",
                      "partial",
                      "unknown"
                    ]
                  },
                  "outcomes": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "authority",
                        "result"
                      ],
                      "properties": {
                        "authority": {
                          "type": "string",
                          "enum": [
                            "agent_claim",
                            "deterministic_validator",
                            "human_acceptance"
                          ]
                        },
                        "result": {
                          "type": "string",
                          "enum": [
                            "accepted",
                            "rejected",
                            "inconclusive"
                          ]
                        }
                      }
                    }
                  }
                }
              }
            ]
          },
          "model": {
            "type": "string",
            "description": "Public model alias requested through Niu."
          },
          "request_kind": {
            "type": "string",
            "enum": [
              "video",
              "inference"
            ],
            "description": "Durable video recovery-route identity; model names and pricing alone do not establish video kind."
          },
          "provider_model": {
            "type": [
              "string",
              "null"
            ],
            "description": "Provider-reported model identity when explicitly returned, including identity-validated video query responses. Missing video model fields remain unknown and are never filled from configured route mappings. It is distinct from the public model alias."
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
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
            "minimum": 0,
            "description": "Legacy dispatch-to-completion attempt interval. Null when completion was first confirmed by supplemental reconciliation; confirmation delay is not generation latency. Prefer timing.total_ms when timing.complete is true for the full measured gateway request interval; interrupted timing must not be treated as completed latency."
          },
          "execution": {
            "type": "string"
          },
          "output_guardrail_outcome": {
            "type": [
              "string",
              "null"
            ],
            "enum": [
              "allowed",
              "redacted",
              "blocked",
              "indeterminate",
              null
            ],
            "description": "Immutable recorded output inspection. Null means no recorded outcome, not successful delivery or content protection. Blocked/indeterminate output is withheld without cancelling incurred usage or customer charges."
          },
          "usage_confidence": {
            "type": "string"
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
            "pattern": "^[0-9]+$",
            "description": "Explicitly reported subset of prompt tokens. Null means unknown."
          },
          "cached_input_tokens": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$",
            "description": "Explicitly reported subset of prompt tokens. Null means unknown."
          },
          "reasoning_output_tokens": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$",
            "description": "Explicitly reported subset of completion tokens. Null means unknown."
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
                      "key_request_rate_disabled"
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
            "oneOf": [
              {
                "type": "null"
              },
              {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "kind",
                  "upstream_http_status"
                ],
                "properties": {
                  "kind": {
                    "type": "string",
                    "enum": [
                      "upstream_http_error",
                      "upstream_region_unavailable",
                      "upstream_timeout",
                      "upstream_connection_error",
                      "upstream_transport_error",
                      "upstream_invalid_response",
                      "response_stream_cancelled"
                    ],
                    "description": "response_stream_cancelled means the response body was dropped before terminal or explicit upstream failure handling. It does not identify who cancelled delivery or prove upstream nonexecution."
                  },
                  "upstream_http_status": {
                    "type": [
                      "integer",
                      "null"
                    ],
                    "minimum": 100,
                    "maximum": 599,
                    "description": "Recorded upstream non-success status. Null for transport, invalid-response or response-cancellation classifications. This is independent of the HTTP status delivered by Niu."
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
              }
            ],
            "description": "Content-free immutable upstream or delivery diagnosis, independent of payload retention. Null means no recorded classification, not a successful request. Does not establish execution, usage or billing certainty."
          },
          "finish_reasons": {
            "type": [
              "array",
              "null"
            ],
            "description": "Explicit allowlisted terminal observations, independent of payload retention. Chat indexes identify choices. For nonstreaming Responses interruptions, index zero identifies the whole response; max_output_tokens maps to length and content_filter maps to content_filter. Completed Responses status alone supplies no stop reason. Null means unknown; finish reasons do not establish task success or customer delivery.",
            "minItems": 1,
            "maxItems": 128,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "index",
                "reason"
              ],
              "properties": {
                "index": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 4294967295
                },
                "reason": {
                  "type": "string",
                  "enum": [
                    "stop",
                    "length",
                    "tool_calls",
                    "content_filter",
                    "function_call"
                  ]
                }
              }
            }
          },
          "customer_charge_currency": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[A-Z]{3}$"
          },
          "customer_charge_nanos": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$"
          },
          "customer_charge_status": {
            "type": "string",
            "enum": [
              "charged",
              "owner_funded",
              "pending",
              "unpriced",
              "not_charged"
            ]
          },
          "timing": {
            "oneOf": [
              {
                "type": "null"
              },
              {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "dispatch_ms",
                  "headers_ms",
                  "first_output_ms",
                  "total_ms",
                  "complete",
                  "http_status"
                ],
                "description": "Monotonic millisecond offsets from gateway request handling. Missing observations stay null; values do not include client network delivery after body consumption. First output means a meaningful streamed Chat event, not a role, keepalive or usage event.",
                "properties": {
                  "dispatch_ms": {
                    "type": [
                      "integer",
                      "null"
                    ],
                    "minimum": 0
                  },
                  "headers_ms": {
                    "type": [
                      "integer",
                      "null"
                    ],
                    "minimum": 0
                  },
                  "first_output_ms": {
                    "type": [
                      "integer",
                      "null"
                    ],
                    "minimum": 0
                  },
                  "total_ms": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "complete": {
                    "type": "boolean",
                    "description": "The response body reached EOF without a stream error; not a claim of successful inference."
                  },
                  "http_status": {
                    "type": [
                      "integer",
                      "null"
                    ],
                    "minimum": 100,
                    "maximum": 599
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
      "format": "uuid"
    },
    "summary": {
      "type": "object",
      "required": [
        "request_count",
        "usage_count",
        "prompt_tokens",
        "completion_tokens",
        "timing_count",
        "average_duration_ms"
      ],
      "properties": {
        "request_count": {
          "type": "integer",
          "format": "int64"
        },
        "usage_count": {
          "type": "integer",
          "format": "int64"
        },
        "prompt_tokens": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "completion_tokens": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "timing_count": {
          "type": "integer",
          "format": "int64"
        },
        "average_duration_ms": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 0,
          "description": "Rounded mean of completed gateway request totals over all matching requests. Interrupted phase measurements are excluded. Historical rows without phase timing are excluded because their dispatch interval uses a different boundary. No eligible samples returns null."
        },
        "unresolved_customer_charge_count": {
          "type": "integer",
          "minimum": 0
        },
        "unpriced_request_count": {
          "type": "integer",
          "minimum": 0
        },
        "owner_funded_request_count": {
          "type": "integer",
          "minimum": 0,
          "description": "Dispatched requests using the account owner’s API credential without a Niu customer debit."
        },
        "delivery_statuses": {
          "type": "array",
          "description": "Counts by recorded delivery HTTP status across all matching requests in the summary snapshot. Null means unknown, not successful or failed.",
          "items": {
            "type": "object",
            "required": [
              "http_status",
              "request_count"
            ],
            "properties": {
              "http_status": {
                "type": [
                  "integer",
                  "null"
                ],
                "minimum": 100,
                "maximum": 599
              },
              "request_count": {
                "type": "integer",
                "minimum": 0
              }
            }
          }
        },
        "customer_charges": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "currency",
              "amount_nanos",
              "charged_requests"
            ],
            "properties": {
              "currency": {
                "type": "string",
                "pattern": "^[A-Z]{3}$"
              },
              "amount_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "charged_requests": {
                "type": "integer",
                "minimum": 0
              }
            }
          }
        },
        "usage_by_model": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "model_alias",
              "request_count",
              "usage_count",
              "prompt_tokens",
              "completion_tokens",
              "unknown_usage_count"
            ],
            "properties": {
              "model_alias": {
                "type": "string"
              },
              "request_count": {
                "type": "integer",
                "minimum": 0
              },
              "usage_count": {
                "type": "integer",
                "minimum": 0
              },
              "prompt_tokens": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "completion_tokens": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "unknown_usage_count": {
                "type": "integer",
                "minimum": 0
              }
            }
          }
        },
        "charges_by_model": {
          "type": "array",
          "items": {
            "allOf": [
              {
                "type": "object",
                "description": "Full-range customer ledger totals grouped separately by currency; missing amounts stay null. Coverage counts partition each row's requests. Supplier expenses are excluded.",
                "required": [
                  "currency",
                  "amount_nanos",
                  "request_count",
                  "charged_requests",
                  "unresolved_requests",
                  "unpriced_requests",
                  "not_charged_requests"
                ],
                "properties": {
                  "currency": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^[A-Z]{3}$"
                  },
                  "amount_nanos": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^[0-9]+$"
                  },
                  "request_count": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "charged_requests": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "unresolved_requests": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "unpriced_requests": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "not_charged_requests": {
                    "type": "integer",
                    "minimum": 0
                  }
                }
              },
              {
                "type": "object",
                "required": [
                  "model_alias"
                ],
                "properties": {
                  "model_alias": {
                    "type": "string"
                  }
                }
              }
            ]
          }
        },
        "charges_by_key": {
          "type": "array",
          "items": {
            "allOf": [
              {
                "type": "object",
                "description": "Full-range customer ledger totals grouped separately by currency; missing amounts stay null. Coverage counts partition each row's requests. Supplier expenses are excluded.",
                "required": [
                  "currency",
                  "amount_nanos",
                  "request_count",
                  "charged_requests",
                  "unresolved_requests",
                  "unpriced_requests",
                  "not_charged_requests"
                ],
                "properties": {
                  "currency": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^[A-Z]{3}$"
                  },
                  "amount_nanos": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^[0-9]+$"
                  },
                  "request_count": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "charged_requests": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "unresolved_requests": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "unpriced_requests": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "not_charged_requests": {
                    "type": "integer",
                    "minimum": 0
                  }
                }
              },
              {
                "type": "object",
                "required": [
                  "api_key_id",
                  "key_name"
                ],
                "properties": {
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
                  }
                }
              }
            ]
          }
        },
        "usage_by_key": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "api_key_id",
              "key_name",
              "request_count",
              "usage_count",
              "prompt_tokens",
              "completion_tokens",
              "unknown_usage_count"
            ],
            "properties": {
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
              "request_count": {
                "type": "integer",
                "minimum": 0
              },
              "usage_count": {
                "type": "integer",
                "minimum": 0
              },
              "prompt_tokens": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "completion_tokens": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "unknown_usage_count": {
                "type": "integer",
                "minimum": 0
              }
            }
          }
        },
        "latency_percentiles": {
          "type": "object",
          "description": "Discrete percentiles of completed gateway body-consumption durations across the filtered range, independent of pagination. Incomplete or missing measurements are excluded. This is not client receipt time or upstream-only generation time.",
          "required": [
            "boundary",
            "sample_count",
            "p50_ms",
            "p95_ms",
            "p99_ms"
          ],
          "properties": {
            "boundary": {
              "type": "string",
              "const": "gateway_body_ms"
            },
            "sample_count": {
              "type": "integer",
              "minimum": 0
            },
            "p50_ms": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 0
            },
            "p95_ms": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 0
            },
            "p99_ms": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 0
            }
          }
        },
        "token_categories": {
          "type": "object",
          "description": "Explicitly reported token subsets over the full filtered snapshot. Sums cover reported requests only; null means no observations. Missing category data is never inferred as zero, and no category-specific billing rate is implied.",
          "required": [
            "cache_write_input_tokens",
            "cached_input_tokens",
            "cache_write_input_requests",
            "cached_input_requests",
            "cache_write_input_unknown_requests",
            "cached_input_unknown_requests",
            "reasoning_output_tokens",
            "reasoning_output_requests",
            "reasoning_output_unknown_requests"
          ],
          "properties": {
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
            "cache_write_input_requests": {
              "type": "integer",
              "minimum": 0
            },
            "cached_input_requests": {
              "type": "integer",
              "minimum": 0
            },
            "cache_write_input_unknown_requests": {
              "type": "integer",
              "minimum": 0
            },
            "cached_input_unknown_requests": {
              "type": "integer",
              "minimum": 0
            },
            "reasoning_output_tokens": {
              "type": [
                "string",
                "null"
              ],
              "pattern": "^[0-9]+$"
            },
            "reasoning_output_requests": {
              "type": "integer",
              "minimum": 0
            },
            "reasoning_output_unknown_requests": {
              "type": "integer",
              "minimum": 0
            }
          }
        },
        "request_histogram": {
          "type": "array",
          "maxItems": 24,
          "description": "Nonempty time buckets over all filtered requests, independent of pagination. Buckets and other summary aggregates share one database snapshot. Empty ranges return an empty array.",
          "items": {
            "type": "object",
            "required": [
              "start_ms",
              "end_ms",
              "request_count"
            ],
            "properties": {
              "start_ms": {
                "type": "integer"
              },
              "end_ms": {
                "type": "integer"
              },
              "request_count": {
                "type": "integer",
                "minimum": 1
              }
            }
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid path or query parameter.

### HTTP 401

Administrator authentication required.

## Behavior and supported scope

Returns metadata for model attempts admitted by Niu, newest first by default, with the requested sort applied to the whole range. Request and response bodies, prompts and completions are not included. Pages are bounded to at most 100 entries. Pass the previous response's next_cursor as after to read older matching entries; traversal is a live view, not a cross-page snapshot. Optional filters apply to the whole workspace scope. summary totals cover the selected filters independent of page. Rows and summary in one response share a database snapshot. Reporting reads use a one-second database lock timeout and a five-second timeout per SQL statement. Timeout returns a sanitized 503 error, never partial results; these are not whole-request deadlines. An absent task_id means the caller did not supply X-Niu-Task-ID. Missing usage remains unknown. All workspace responses exclude Supplier expenses and platform margins, including for installation administrators. Customer-facing charges and nullable observed request phase timing are included.

**Supported scope:** implemented
