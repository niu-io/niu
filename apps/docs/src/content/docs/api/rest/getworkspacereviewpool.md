---
title: "Review: Read a workspace model policy"
description: "GET /api/v1/workspaces/{workspace}/routing/{slug}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/workspaces/{workspace}/routing/{slug}`

Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.

Operation: `getWorkspaceReviewPool`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/workspaces/{workspace}/routing/{slug}" \
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

### slug

Location: **path**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
  "maxLength": 80
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Workspace-scoped result; no-store.

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "slug",
        "name",
        "description",
        "enabled",
        "revision",
        "candidates"
      ],
      "properties": {
        "slug": {
          "type": "string",
          "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
          "maxLength": 80
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "description": {
          "type": "string",
          "maxLength": 4000
        },
        "enabled": {
          "type": "boolean"
        },
        "revision": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740990
        },
        "candidates": {
          "type": "array",
          "minItems": 1,
          "maxItems": 64,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "alias",
              "priority",
              "weight",
              "enabled"
            ],
            "properties": {
              "alias": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "priority": {
                "type": "integer",
                "minimum": -1000,
                "maximum": 1000
              },
              "weight": {
                "type": "integer",
                "minimum": 1,
                "maximum": 10000
              },
              "enabled": {
                "type": "boolean"
              }
            }
          }
        },
        "rules": {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id",
              "name",
              "candidates"
            ],
            "properties": {
              "id": {
                "type": "string"
              },
              "name": {
                "type": "string"
              },
              "enabled": {
                "type": "boolean"
              },
              "conditions": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "protocol": {
                    "type": "string",
                    "enum": [
                      "chat",
                      "messages",
                      "responses"
                    ]
                  },
                  "streaming": {
                    "type": "boolean"
                  },
                  "vision": {
                    "type": "boolean"
                  },
                  "tools": {
                    "type": "boolean"
                  },
                  "structured_output": {
                    "type": "boolean"
                  },
                  "reasoning": {
                    "type": "boolean"
                  },
                  "min_input_tokens": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "max_input_tokens": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "min_output_tokens": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "max_output_tokens": {
                    "type": "integer",
                    "minimum": 0
                  }
                }
              },
              "candidates": {
                "type": "array",
                "minItems": 1,
                "maxItems": 64,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "alias",
                    "priority",
                    "weight",
                    "enabled"
                  ],
                  "properties": {
                    "alias": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 200
                    },
                    "priority": {
                      "type": "integer",
                      "minimum": -1000,
                      "maximum": 1000
                    },
                    "weight": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 10000
                    },
                    "enabled": {
                      "type": "boolean"
                    }
                  }
                }
              }
            }
          }
        },
        "default_action": {
          "type": "string",
          "enum": [
            "candidates",
            "reject"
          ]
        },
        "strategy": {
          "type": "object",
          "additionalProperties": false,
          "description": "Versioned selection strategy. Omitted legacy configurations use version 1 priority/weight. Version 1 supports priority/weight and customer price. Version 2 requires Auto with 2-8 declared response-compatible paths and an optional bounded decider. Auto evaluates caller routing context first and invokes the decider only when no context path matches. The decider may return only a declared, request-compatible path; unknown or incompatible decisions are failures, never silent substitutions. Missing or incomparable customer prices stay unknown and are never treated as free. Provider procurement rates never participate.",
          "required": [
            "version",
            "mode"
          ],
          "properties": {
            "version": {
              "type": "integer",
              "enum": [
                1,
                2
              ]
            },
            "mode": {
              "type": "string",
              "enum": [
                "priority_weight",
                "customer_price",
                "auto"
              ]
            },
            "customer_price": {
              "type": "object",
              "additionalProperties": false,
              "description": "Required exactly when version is 1 and mode is customer_price. Estimates an ordinary request in one explicit currency and unit. Estimates include the selected whole-request context tier, the request fee and the minimum charge; cached and reasoning discounts are never assumed. Ties use higher priority, then higher weight, then alias order.",
              "required": [
                "currency",
                "unit",
                "input_tokens",
                "output_tokens"
              ],
              "properties": {
                "currency": {
                  "type": "string",
                  "pattern": "^[A-Z]{3}$"
                },
                "unit": {
                  "type": "string",
                  "enum": [
                    "nanounits_per_million_tokens"
                  ]
                },
                "input_tokens": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 10000000
                },
                "output_tokens": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 10000000
                }
              }
            },
            "auto": {
              "type": "object",
              "additionalProperties": false,
              "description": "Required exactly when version is 2 and mode is auto. Paths reference top-level candidate aliases so Auto cannot expand the saved model inventory or the caller's grants. Caller context (task/stage) is evaluated before any decider call. The optional decider runs once, with the caller's key, grants and spending authority, under the declared timeout, token and customer-charge bounds. If the decider abstains, fails, times out, is cancelled or returns an unknown or response-incompatible path, the configured action either falls back to deterministic priority/weight or rejects the request before dispatch.",
              "required": [
                "paths"
              ],
              "properties": {
                "paths": {
                  "type": "array",
                  "minItems": 2,
                  "maxItems": 8,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "id",
                      "response_type",
                      "candidates"
                    ],
                    "properties": {
                      "id": {
                        "type": "string",
                        "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
                        "maxLength": 64
                      },
                      "name": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 120
                      },
                      "description": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 280
                      },
                      "response_type": {
                        "type": "string",
                        "enum": [
                          "text",
                          "structured",
                          "embedding"
                        ]
                      },
                      "candidates": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 64,
                        "items": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 200
                        }
                      },
                      "task": {
                        "type": "array",
                        "maxItems": 16,
                        "items": {
                          "type": "string",
                          "pattern": "^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$",
                          "maxLength": 64
                        }
                      },
                      "stage": {
                        "type": "array",
                        "maxItems": 16,
                        "items": {
                          "type": "string",
                          "pattern": "^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$",
                          "maxLength": 64
                        }
                      }
                    }
                  }
                },
                "decider": {
                  "type": "object",
                  "additionalProperties": false,
                  "description": "Optional single-round semantic decider. The model must be a visible Chat model granted to the invoking key and have a comparable customer selling price in the declared currency and unit; otherwise no paid call is made and the configured failure action applies. max_calls is fixed at one. max_input_tokens bounds the constructed decision prompt by a character estimate, not exact tokenization. max_output_tokens bounds the decision completion. max_spend_nanos is a customer-charge ceiling verified from the current customer price before the call and from reported usage afterwards. A missing, foreign-currency or non-nanounit customer price leaves the bound unverifiable and prevents the call.",
                  "required": [
                    "model",
                    "currency",
                    "timeout_ms",
                    "max_calls",
                    "max_input_tokens",
                    "max_output_tokens",
                    "max_spend_nanos",
                    "min_confidence"
                  ],
                  "properties": {
                    "model": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 200
                    },
                    "currency": {
                      "type": "string",
                      "pattern": "^[A-Z]{3}$"
                    },
                    "timeout_ms": {
                      "type": "integer",
                      "minimum": 50,
                      "maximum": 5000
                    },
                    "max_calls": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 1
                    },
                    "max_input_tokens": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 4096
                    },
                    "max_output_tokens": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 1024
                    },
                    "max_spend_nanos": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 100000000
                    },
                    "min_confidence": {
                      "type": "number",
                      "minimum": 0,
                      "maximum": 1
                    },
                    "on_abstain": {
                      "type": "string",
                      "enum": [
                        "fallback",
                        "reject"
                      ]
                    },
                    "on_failure": {
                      "type": "string",
                      "enum": [
                        "fallback",
                        "reject"
                      ]
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
}
```

### HTTP 400

Invalid configuration or cursor

### HTTP 401

Missing, expired or revoked credential

### HTTP 403

Required delegated capability is absent

### HTTP 404

Scoped pool not found

### HTTP 409

Expected revision conflict

## Behavior and supported scope

Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.

**Supported scope:** implemented
