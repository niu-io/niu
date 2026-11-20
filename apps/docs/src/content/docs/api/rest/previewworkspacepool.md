---
title: "Validate a workspace model policy without dispatch"
description: "POST /v1/routing/preview"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/routing/preview`

Requires delegated pools:read. Validates a proposed workspace policy without saving or dispatching inference. Optional context simulates the same rule matching, declared-protocol/capability filters, versioned strategy and priority/weight bands used by selection. Context traits are normalized with the same protocol support matrix used by dispatch: image inputs, tools, structured output and reasoning controls that the selected protocol cannot express are rejected explicitly instead of being silently dropped. In customer-price mode, only eligible candidates with a comparable customer selling price are ranked; missing or incomparable prices stay explicitly unknown and are never treated as free. The evaluation uses the strategy's explicit currency, unit, input-token and output-token assumptions and includes the selected whole-request context tier, request fee and minimum charge. Selection is deterministic: lower estimate, then higher priority, then higher weight, then alias order. When no candidate has a comparable price, selection falls back to priority/weight and reports why. In Auto mode, preview evaluates optional task/stage caller context against response-compatible paths without invoking the decider. It reports whether runtime would select from context, require the bounded decider, fall back or reject, plus the decider grant, comparable-price and input-bound checks. Preview calls are always zero and never dispatch inference or incur a decision charge. Weights describe a distribution, not a promise of the next selected model. A zero denominator means no selection. Provider procurement prices, offers and margins are never read. This does not validate a complete protocol input, prove live upstream access, reserve capacity, estimate actual charges or judge quality/value. Legacy bare configuration bodies remain accepted. Unknown context fields, unsupported protocols and out-of-bounds token traits are rejected.

Operation: `previewWorkspacePool`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/routing/preview" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/routing/preview" \
  -H "X-Niu-API-Key: $NIU_API_KEY" \
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
  "oneOf": [
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "configuration": {
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
        },
        "context": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "protocol"
          ],
          "properties": {
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
            "embedding_dimensions": {
              "type": "boolean"
            },
            "embedding_base64": {
              "type": "boolean"
            },
            "estimated_input_tokens": {
              "type": "integer",
              "minimum": 0,
              "maximum": 10000000
            },
            "requested_output_tokens": {
              "type": "integer",
              "minimum": 1,
              "maximum": 10000000
            },
            "task": {
              "type": "string",
              "pattern": "^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$",
              "maxLength": 64,
              "description": "Optional caller task context for Auto preview. It uses the same bounded normalization as x-niu-routing-context. Preview never invokes the decider."
            },
            "stage": {
              "type": "string",
              "pattern": "^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$",
              "maxLength": 64,
              "description": "Optional caller workflow-stage context for Auto preview."
            }
          }
        }
      },
      "required": [
        "configuration"
      ]
    },
    {
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
  ]
}
```

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
      "properties": {
        "configuration_valid": {
          "type": "boolean"
        },
        "persisted": {
          "type": "boolean",
          "const": false
        },
        "live_model_verification": {
          "type": "string",
          "const": "not_performed"
        },
        "candidate_count": {
          "type": "integer"
        },
        "rule_count": {
          "type": "integer"
        },
        "strategy": {
          "type": "object"
        },
        "simulation": {
          "type": "object",
          "properties": {
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
            "matched_rule": {
              "type": [
                "string",
                "null"
              ]
            },
            "outcome": {
              "type": "string",
              "enum": [
                "pool_disabled",
                "default_reject",
                "no_eligible_candidates",
                "candidates"
              ]
            },
            "strategy": {
              "type": "object"
            },
            "selection_basis": {
              "type": "string",
              "enum": [
                "not_evaluated",
                "priority_weight",
                "priority_weight_fallback",
                "customer_price",
                "auto_context",
                "auto_decider_required",
                "auto_rejected"
              ]
            },
            "selected_path": {
              "type": [
                "string",
                "null"
              ],
              "description": "Auto path selected deterministically from caller context. Null when the runtime would require the decider, fall back or reject."
            },
            "selected_candidate": {
              "type": [
                "string",
                "null"
              ]
            },
            "fallback_reason": {
              "type": [
                "string",
                "null"
              ]
            },
            "price_evaluation": {
              "type": [
                "object",
                "null"
              ]
            },
            "decision": {
              "type": [
                "object",
                "null"
              ],
              "description": "Bounded Auto decision evidence from preview. Preview reports calls as zero and live_dispatch as false because it never invokes the decider."
            },
            "live_dispatch": {
              "type": "boolean",
              "const": false
            },
            "candidates": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "alias": {
                    "type": "string"
                  },
                  "priority": {
                    "type": "integer"
                  },
                  "weight": {
                    "type": "integer"
                  },
                  "eligible": {
                    "type": "boolean"
                  },
                  "exclusion_reason": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "selection_weight": {
                    "type": "object",
                    "properties": {
                      "numerator": {
                        "type": "integer",
                        "minimum": 0
                      },
                      "denominator": {
                        "type": "integer",
                        "minimum": 0
                      }
                    }
                  },
                  "estimated_customer_charge_nanos": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "price_unknown_reason": {
                    "type": [
                      "string",
                      "null"
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

Requires delegated pools:read. Validates a proposed workspace policy without saving or dispatching inference. Optional context simulates the same rule matching, declared-protocol/capability filters, versioned strategy and priority/weight bands used by selection. Context traits are normalized with the same protocol support matrix used by dispatch: image inputs, tools, structured output and reasoning controls that the selected protocol cannot express are rejected explicitly instead of being silently dropped. In customer-price mode, only eligible candidates with a comparable customer selling price are ranked; missing or incomparable prices stay explicitly unknown and are never treated as free. The evaluation uses the strategy's explicit currency, unit, input-token and output-token assumptions and includes the selected whole-request context tier, request fee and minimum charge. Selection is deterministic: lower estimate, then higher priority, then higher weight, then alias order. When no candidate has a comparable price, selection falls back to priority/weight and reports why. In Auto mode, preview evaluates optional task/stage caller context against response-compatible paths without invoking the decider. It reports whether runtime would select from context, require the bounded decider, fall back or reject, plus the decider grant, comparable-price and input-bound checks. Preview calls are always zero and never dispatch inference or incur a decision charge. Weights describe a distribution, not a promise of the next selected model. A zero denominator means no selection. Provider procurement prices, offers and margins are never read. This does not validate a complete protocol input, prove live upstream access, reserve capacity, estimate actual charges or judge quality/value. Legacy bare configuration bodies remain accepted. Unknown context fields, unsupported protocols and out-of-bounds token traits are rejected.

**Supported scope:** implemented
