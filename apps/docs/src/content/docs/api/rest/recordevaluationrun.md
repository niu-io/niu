---
title: "Record attributed judgments and customer-safe execution evidence"
description: "POST /v1/evaluations/{slug}/runs"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/evaluations/{slug}/runs`

Requires a current workspace API key with explicitly delegated evaluations:write. No-store response. Judgments are submitter-reported, not platform guarantees. Inference is separately authorized and charged. Same run slug and identical submission returns the original immutable receipt; changed submission conflicts. Includes every attempt in each selected operation. Pending, owner-funded and unavailable charges remain unknown. No inference is performed.

Operation: `recordEvaluationRun`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

Authentication alternative: `bearerAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/evaluations/{slug}/runs" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/evaluations/{slug}/runs" \
  -H "X-Niu-API-Key: $NIU_API_KEY" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### slug

Location: **path**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
  "maxLength": 80
}
```

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "properties": {
    "slug": {
      "type": "string",
      "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
      "maxLength": 80
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "evaluation_revision": {
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    },
    "evaluator": {
      "type": "object",
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "agent",
            "check"
          ]
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "version": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        }
      },
      "required": [
        "kind",
        "name",
        "version"
      ],
      "additionalProperties": false
    },
    "results": {
      "type": "array",
      "minItems": 1,
      "maxItems": 64,
      "items": {
        "type": "object",
        "properties": {
          "sample": {
            "type": "string",
            "minLength": 1,
            "maxLength": 100
          },
          "attempt_id": {
            "type": "string",
            "format": "uuid"
          },
          "verdict": {
            "type": "string",
            "enum": [
              "accepted",
              "rejected",
              "unknown"
            ]
          },
          "reason": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 2000
          }
        },
        "required": [
          "sample",
          "attempt_id",
          "verdict"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "slug",
    "name",
    "evaluation_revision",
    "evaluator",
    "results"
  ],
  "additionalProperties": false
}
```

## Responses

### HTTP 200

Scoped evidence

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "slug": {
      "type": "string"
    },
    "name": {
      "type": "string"
    },
    "evaluation": {
      "type": "string"
    },
    "evaluation_revision": {
      "type": "integer"
    },
    "definition": {
      "type": "object",
      "properties": {
        "slug": {
          "type": "string",
          "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
          "maxLength": 80
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "task": {
          "type": "string",
          "minLength": 1,
          "maxLength": 4000
        },
        "rubric": {
          "type": "string",
          "minLength": 1,
          "maxLength": 8000
        },
        "protocol": {
          "type": "string",
          "enum": [
            "chat",
            "responses",
            "messages",
            "embeddings",
            "generate_content"
          ]
        },
        "revision": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740990
        },
        "samples": {
          "type": "array",
          "minItems": 1,
          "maxItems": 64,
          "items": {
            "type": "object",
            "properties": {
              "reference": {
                "type": "string",
                "minLength": 1,
                "maxLength": 100,
                "pattern": "^[A-Za-z0-9_.-]+$"
              },
              "request_sha256": {
                "type": "string",
                "pattern": "^[0-9a-f]{64}$"
              }
            },
            "required": [
              "reference",
              "request_sha256"
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "slug",
        "name",
        "task",
        "rubric",
        "protocol",
        "revision",
        "samples"
      ],
      "additionalProperties": false
    },
    "evaluator": {
      "type": "object"
    },
    "submitter": {
      "type": "object",
      "description": "Attributed delegated API key; internal identifiers are API evidence, not UI labels."
    },
    "capture": {
      "type": "object",
      "properties": {
        "consistency": {
          "const": "repeatable_read"
        },
        "started_at": {
          "type": "string"
        },
        "finished_at": {
          "type": "string"
        }
      },
      "required": [
        "consistency",
        "started_at",
        "finished_at"
      ]
    },
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "sample": {
            "type": "string"
          },
          "request_sha256": {
            "type": "string"
          },
          "input_match": {
            "enum": [
              "verified",
              "unverified"
            ]
          },
          "source_binding": {
            "type": [
              "object",
              "null"
            ]
          },
          "evaluated_attempt_id": {
            "type": "string"
          },
          "operation_id": {
            "type": "string"
          },
          "judgment": {
            "type": "object"
          },
          "duration_ms": {
            "type": [
              "integer",
              "null"
            ]
          },
          "attempts": {
            "type": "array",
            "items": {
              "type": "object",
              "description": "Customer-safe execution, routing revisions, usage, timing and charge coverage. No procurement information."
            }
          },
          "pool_selections": {
            "type": "array",
            "items": {
              "type": "object"
            }
          }
        },
        "required": [
          "sample",
          "request_sha256",
          "input_match",
          "source_binding",
          "evaluated_attempt_id",
          "operation_id",
          "judgment",
          "duration_ms",
          "attempts",
          "pool_selections"
        ]
      }
    },
    "summary": {
      "type": "object",
      "properties": {
        "samples": {
          "type": "integer"
        },
        "verified_inputs": {
          "type": "integer"
        },
        "unverified_inputs": {
          "type": "integer"
        },
        "verdicts": {
          "type": "object",
          "additionalProperties": {
            "type": "integer"
          }
        },
        "attempts": {
          "type": "integer"
        },
        "unknown_charge_attempts": {
          "type": "integer"
        },
        "customer_charge_totals": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "dimension": {
                "type": "string"
              },
              "amount": {
                "type": "string"
              }
            },
            "required": [
              "dimension",
              "amount"
            ]
          }
        },
        "cost_per_accepted": {
          "oneOf": [
            {
              "type": "null"
            },
            {
              "type": "object",
              "properties": {
                "dimension": {
                  "type": "string"
                },
                "numerator": {
                  "type": "string"
                },
                "denominator": {
                  "type": "integer"
                }
              },
              "required": [
                "dimension",
                "numerator",
                "denominator"
              ]
            }
          ]
        },
        "cost_per_accepted_basis": {
          "const": "all_attempts_in_submitted_operations"
        },
        "duration_basis": {
          "const": "evaluated_attempt_only"
        }
      },
      "required": [
        "samples",
        "verified_inputs",
        "unverified_inputs",
        "verdicts",
        "attempts",
        "unknown_charge_attempts",
        "customer_charge_totals",
        "cost_per_accepted",
        "cost_per_accepted_basis",
        "duration_basis"
      ]
    }
  },
  "required": [
    "slug",
    "name",
    "evaluation",
    "evaluation_revision",
    "definition",
    "evaluator",
    "submitter",
    "capture",
    "results",
    "summary"
  ]
}
```

### HTTP 400

Invalid input or mismatched evaluation binding

### HTTP 401

Invalid, expired or revoked key

### HTTP 403

Current delegated capability required

### HTTP 404

Scoped definition or run not found

### HTTP 409

Revision or immutable submission conflict

## Behavior and supported scope

Requires a current workspace API key with explicitly delegated evaluations:write. No-store response. Judgments are submitter-reported, not platform guarantees. Inference is separately authorized and charged. Same run slug and identical submission returns the original immutable receipt; changed submission conflicts. Includes every attempt in each selected operation. Pending, owner-funded and unavailable charges remain unknown. No inference is performed.

**Supported scope:** implemented
