---
title: "Analyze a matched, opt-in paired benchmark dataset"
description: "POST /admin/v1/benchmarks/compare"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/benchmarks/compare`

Stateless analysis of imported execution records and settled amounts. Accepts an installation administrator or a scoped operator with read permission. Submitted datasets are not bound to the caller's tenant or checked against stored evidence; this endpoint is not an Enterprise authorization boundary. This operation never dispatches model work, reserves budget, or persists a report.

Operation: `analyzePairedBenchmark`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "adminBearerAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/benchmarks/compare" \
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
    "schema_version",
    "mode",
    "opt_in",
    "authorization_ref",
    "candidates",
    "tasks",
    "repetitions",
    "acceptance",
    "cash_budget",
    "trials"
  ],
  "properties": {
    "schema_version": {
      "type": "integer",
      "const": 1
    },
    "mode": {
      "type": "string",
      "const": "paired_experiment"
    },
    "opt_in": {
      "type": "boolean",
      "const": true
    },
    "authorization_ref": {
      "type": "string",
      "minLength": 1
    },
    "candidates": {
      "type": "array",
      "minItems": 2,
      "maxItems": 2,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "model_alias",
          "offer_revision"
        ],
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "model_alias": {
            "type": "string",
            "minLength": 1
          },
          "offer_revision": {
            "type": "string",
            "minLength": 1
          }
        }
      }
    },
    "tasks": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "snapshot_sha256",
          "tools_sha256",
          "permissions_sha256",
          "acceptance_sha256"
        ],
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "snapshot_sha256": {
            "type": "string",
            "pattern": "^[A-Fa-f0-9]{64}$"
          },
          "tools_sha256": {
            "type": "string",
            "pattern": "^[A-Fa-f0-9]{64}$"
          },
          "permissions_sha256": {
            "type": "string",
            "pattern": "^[A-Fa-f0-9]{64}$"
          },
          "acceptance_sha256": {
            "type": "string",
            "pattern": "^[A-Fa-f0-9]{64}$"
          }
        }
      }
    },
    "repetitions": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    },
    "acceptance": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "max_latency_ms",
        "min_quality_basis_points"
      ],
      "properties": {
        "max_latency_ms": {
          "type": "integer",
          "minimum": 0
        },
        "min_quality_basis_points": {
          "type": "integer",
          "minimum": 0,
          "maximum": 10000
        }
      }
    },
    "cash_budget": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "currency",
        "limit_nanos"
      ],
      "properties": {
        "currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$"
        },
        "limit_nanos": {
          "type": "string",
          "pattern": "^[0-9]+$"
        }
      }
    },
    "trials": {
      "type": "array",
      "minItems": 2,
      "maxItems": 10000,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "task_snapshot_id",
          "candidate_id",
          "offer_revision",
          "repetition",
          "execution",
          "gateway_attempts",
          "costs"
        ],
        "properties": {
          "task_snapshot_id": {
            "type": "string",
            "minLength": 1
          },
          "candidate_id": {
            "type": "string",
            "minLength": 1
          },
          "offer_revision": {
            "type": "string",
            "minLength": 1
          },
          "repetition": {
            "type": "integer",
            "minimum": 1
          },
          "execution": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "schema_version",
              "source",
              "record_id",
              "task_id",
              "coverage",
              "spans",
              "links",
              "outcomes"
            ],
            "properties": {
              "schema_version": {
                "type": "integer",
                "const": 1
              },
              "source": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "record_id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "task_id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "coverage": {
                "type": "string",
                "enum": [
                  "complete",
                  "partial",
                  "unknown"
                ]
              },
              "spans": {
                "type": "array",
                "minItems": 1,
                "maxItems": 10000,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "id",
                    "kind"
                  ],
                  "properties": {
                    "id": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 200
                    },
                    "kind": {
                      "type": "string",
                      "enum": [
                        "task",
                        "agent",
                        "step",
                        "model_invocation",
                        "tool_invocation",
                        "attempt",
                        "validation",
                        "human_intervention",
                        "checkpoint"
                      ]
                    },
                    "status": {
                      "type": [
                        "string",
                        "null"
                      ],
                      "enum": [
                        "running",
                        "completed",
                        "failed",
                        "cancelled",
                        "unknown",
                        null
                      ],
                      "description": "Source-reported lifecycle status. Missing or null means unknown; Niu does not infer cancellation from a missing end time."
                    },
                    "started_at_ms": {
                      "type": [
                        "integer",
                        "null"
                      ],
                      "minimum": 0
                    },
                    "ended_at_ms": {
                      "type": [
                        "integer",
                        "null"
                      ],
                      "minimum": 0
                    },
                    "requested_model": {
                      "type": [
                        "string",
                        "null"
                      ],
                      "maxLength": 200
                    },
                    "reported_model": {
                      "type": [
                        "string",
                        "null"
                      ],
                      "maxLength": 200,
                      "description": "Provider-reported actual identity; absent means unknown."
                    },
                    "charge_ref": {
                      "type": [
                        "string",
                        "null"
                      ],
                      "maxLength": 200,
                      "description": "Reference to canonical accounting evidence; does not create another charge. An attempt UUID can resolve to an assigned supplier account."
                    }
                  }
                }
              },
              "links": {
                "type": "array",
                "maxItems": 50000,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "from",
                    "to",
                    "kind"
                  ],
                  "properties": {
                    "from": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 200
                    },
                    "to": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 200
                    },
                    "kind": {
                      "type": "string",
                      "enum": [
                        "contains",
                        "delegates",
                        "depends_on",
                        "fallbacks",
                        "retries",
                        "resumes"
                      ],
                      "description": "A fallback edge points from a model invocation to its explicitly selected replacement invocation."
                    }
                  }
                }
              },
              "outcomes": {
                "type": "array",
                "maxItems": 10000,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "span_id",
                    "evidence_id",
                    "authority",
                    "result"
                  ],
                  "properties": {
                    "span_id": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 200
                    },
                    "evidence_id": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 200
                    },
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
              },
              "external_usage": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "authority",
                  "agent_version",
                  "request_count",
                  "retry_count",
                  "input_tokens",
                  "output_tokens",
                  "cache_read_tokens",
                  "cache_creation_tokens",
                  "cost_nanos",
                  "currency"
                ],
                "properties": {
                  "authority": {
                    "type": "string",
                    "const": "agent_reported_estimate"
                  },
                  "agent_version": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "maxLength": 200
                  },
                  "request_count": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "retry_count": {
                    "type": "integer",
                    "minimum": 0,
                    "description": "Source-reported retries; separate from Niu gateway attempt records."
                  },
                  "input_tokens": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^\\\\d{1,38}$"
                  },
                  "output_tokens": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^\\\\d{1,38}$"
                  },
                  "cache_read_tokens": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^\\\\d{1,38}$"
                  },
                  "cache_creation_tokens": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^\\\\d{1,38}$"
                  },
                  "cost_nanos": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^\\\\d{1,38}$",
                    "description": "Estimated source cost in nanounits; not an invoice or settled charge."
                  },
                  "currency": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^[A-Z]{3}$"
                  }
                }
              }
            }
          },
          "gateway_attempts": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "attempt_id",
                "task_id",
                "model_alias",
                "currency",
                "cash_nanos",
                "api_equivalent_nanos"
              ],
              "properties": {
                "attempt_id": {
                  "type": "string",
                  "format": "uuid",
                  "description": "Canonical Niu gateway attempt ID referenced by the execution spans."
                },
                "task_id": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 200
                },
                "model_alias": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 200
                },
                "currency": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "pattern": "^[A-Z]{3}$"
                },
                "cash_nanos": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "pattern": "^[0-9]+$"
                },
                "api_equivalent_nanos": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "pattern": "^[0-9]+$"
                }
              }
            }
          },
          "quality_basis_points": {
            "type": [
              "integer",
              "null"
            ],
            "minimum": 0,
            "maximum": 10000
          },
          "costs": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "currency",
              "api_equivalent_nanos",
              "evaluator_api_equivalent_nanos",
              "cash_nanos",
              "evaluator_cash_nanos",
              "complete"
            ],
            "properties": {
              "currency": {
                "type": "string",
                "pattern": "^[A-Z]{3}$"
              },
              "api_equivalent_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "evaluator_api_equivalent_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "cash_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "evaluator_cash_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "complete": {
                "type": "boolean",
                "const": true
              }
            }
          }
        }
      }
    }
  }
}
```

## Responses

### HTTP 200

Paired outcome, exact cost, coverage and uncertainty report.

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
        "schema_version",
        "evidence_kind",
        "authorization_ref",
        "currency",
        "cash_budget_nanos",
        "total_cash_nanos",
        "api_equivalent_nanos",
        "candidates",
        "pairs",
        "paired_uncertainty_95",
        "diagnostics",
        "limits"
      ],
      "properties": {
        "schema_version": {
          "type": "integer",
          "const": 1
        },
        "evidence_kind": {
          "type": "string",
          "const": "paired_experiment"
        },
        "authorization_ref": {
          "type": "string"
        },
        "currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$"
        },
        "cash_budget_nanos": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "total_cash_nanos": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "api_equivalent_nanos": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "candidates": {
          "type": "array",
          "minItems": 2,
          "maxItems": 2,
          "items": {
            "type": "object",
            "required": [
              "candidate_id",
              "model_alias",
              "offer_revision",
              "runs",
              "complete_coverage_runs",
              "source_accepted_runs",
              "qualified_completions",
              "qualification_rate_basis_points",
              "api_equivalent_per_qualified_completion",
              "cash_per_qualified_completion",
              "api_equivalent_nanos",
              "evaluator_api_equivalent_nanos",
              "total_api_equivalent_nanos",
              "cash_nanos",
              "evaluator_cash_nanos",
              "total_cash_nanos",
              "observed_latency_p50_ms",
              "observed_latency_p95_ms"
            ],
            "properties": {
              "candidate_id": {
                "type": "string"
              },
              "model_alias": {
                "type": "string"
              },
              "offer_revision": {
                "type": "string"
              },
              "runs": {
                "type": "integer"
              },
              "complete_coverage_runs": {
                "type": "integer"
              },
              "source_accepted_runs": {
                "type": "integer"
              },
              "qualified_completions": {
                "type": "integer"
              },
              "qualification_rate_basis_points": {
                "type": "integer"
              },
              "api_equivalent_per_qualified_completion": {
                "oneOf": [
                  {
                    "type": "object",
                    "required": [
                      "numerator_nanos",
                      "denominator"
                    ],
                    "properties": {
                      "numerator_nanos": {
                        "type": "string",
                        "pattern": "^[0-9]+$"
                      },
                      "denominator": {
                        "type": "integer",
                        "minimum": 1
                      }
                    }
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "cash_per_qualified_completion": {
                "oneOf": [
                  {
                    "type": "object",
                    "required": [
                      "numerator_nanos",
                      "denominator"
                    ],
                    "properties": {
                      "numerator_nanos": {
                        "type": "string",
                        "pattern": "^[0-9]+$"
                      },
                      "denominator": {
                        "type": "integer",
                        "minimum": 1
                      }
                    }
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "api_equivalent_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "evaluator_api_equivalent_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "total_api_equivalent_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "cash_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "evaluator_cash_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "total_cash_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "observed_latency_p50_ms": {
                "type": [
                  "integer",
                  "null"
                ],
                "minimum": 0
              },
              "observed_latency_p95_ms": {
                "type": [
                  "integer",
                  "null"
                ],
                "minimum": 0
              }
            }
          }
        },
        "pairs": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "task_snapshot_id",
              "repetition",
              "result"
            ],
            "properties": {
              "task_snapshot_id": {
                "type": "string"
              },
              "repetition": {
                "type": "integer",
                "minimum": 1
              },
              "result": {
                "type": "string",
                "enum": [
                  "candidate_a_wins",
                  "candidate_b_wins",
                  "tie",
                  "both_fail_acceptance"
                ]
              }
            }
          }
        },
        "paired_uncertainty_95": {
          "type": "object",
          "required": [
            "wins",
            "losses",
            "ties",
            "both_failed",
            "evaluated_pairs",
            "lower_95",
            "upper_95"
          ],
          "properties": {
            "wins": {
              "type": "integer",
              "minimum": 0
            },
            "losses": {
              "type": "integer",
              "minimum": 0
            },
            "ties": {
              "type": "integer",
              "minimum": 0
            },
            "both_failed": {
              "type": "integer",
              "minimum": 0
            },
            "evaluated_pairs": {
              "type": "integer",
              "minimum": 0
            },
            "lower_95": {
              "type": [
                "number",
                "null"
              ],
              "minimum": 0,
              "maximum": 1
            },
            "upper_95": {
              "type": [
                "number",
                "null"
              ],
              "minimum": 0,
              "maximum": 1
            }
          }
        },
        "diagnostics": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "label",
              "rule",
              "summary",
              "evidence"
            ],
            "properties": {
              "label": {
                "type": "string",
                "const": "heuristic"
              },
              "rule": {
                "type": "string"
              },
              "summary": {
                "type": "string"
              },
              "evidence": {
                "type": "array",
                "items": {
                  "type": "object",
                  "required": [
                    "candidate_id",
                    "task_snapshot_id",
                    "record_id",
                    "gateway_attempt_ids",
                    "span_ids"
                  ],
                  "properties": {
                    "candidate_id": {
                      "type": "string"
                    },
                    "task_snapshot_id": {
                      "type": "string"
                    },
                    "record_id": {
                      "type": "string"
                    },
                    "gateway_attempt_ids": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "format": "uuid"
                      }
                    },
                    "span_ids": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "limits": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid dataset, mismatched trial, incomplete cost evidence, or budget limit exceeded.

### HTTP 401

Invalid or expired administrator/operator credential.

## Behavior and supported scope

Stateless analysis of imported execution records and settled amounts. Accepts an installation administrator or a scoped operator with read permission. Submitted datasets are not bound to the caller's tenant or checked against stored evidence; this endpoint is not an Enterprise authorization boundary. This operation never dispatches model work, reserves budget, or persists a report.
