---
title: "List immutable evaluation run receipts"
description: "GET /v1/evaluations/{slug}/runs"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/evaluations/{slug}/runs`

Requires a current workspace API key with explicitly delegated evaluations:read. No-store response. Judgments are submitter-reported, not platform guarantees. Inference is separately authorized and charged.

Operation: `listEvaluationRuns`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/evaluations/{slug}/runs" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/evaluations/{slug}/runs" \
  -H "X-Niu-API-Key: $NIU_API_KEY"
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

### after

Location: **query**. Optional.

```json
{
  "type": "string",
  "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
  "maxLength": 80
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Scoped evidence

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "properties": {
          "slug": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "evaluation_revision": {
            "type": "integer"
          },
          "created_at": {
            "type": "string"
          },
          "evaluator": {
            "type": "object"
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
          "evaluation_revision",
          "created_at",
          "evaluator",
          "summary"
        ]
      }
    },
    "next_after": {
      "type": [
        "string",
        "null"
      ]
    }
  },
  "required": [
    "data",
    "next_after"
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

Requires a current workspace API key with explicitly delegated evaluations:read. No-store response. Judgments are submitter-reported, not platform guarantees. Inference is separately authorized and charged.

**Supported scope:** implemented
