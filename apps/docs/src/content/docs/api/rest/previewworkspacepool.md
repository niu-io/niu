---
title: "Validate a workspace model policy without dispatch"
description: "POST /v1/pools/preview"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/pools/preview`

Requires delegated pools:read. Validates a proposed workspace policy without saving or dispatching inference. Optional context simulates the same rule matching, declared-protocol/capability filters and priority/weight bands used by selection. Weights describe a distribution, not a promise of the next selected model. A zero denominator means no selection. This does not validate a complete protocol input, prove live upstream access, reserve capacity, estimate charges or judge quality/value. Legacy bare configuration bodies remain accepted. Unknown context fields, unsupported protocols and out-of-bounds token traits are rejected.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/pools/preview" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/pools/preview" \
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

Requires delegated pools:read. Validates a proposed workspace policy without saving or dispatching inference. Optional context simulates the same rule matching, declared-protocol/capability filters and priority/weight bands used by selection. Weights describe a distribution, not a promise of the next selected model. A zero denominator means no selection. This does not validate a complete protocol input, prove live upstream access, reserve capacity, estimate charges or judge quality/value. Legacy bare configuration bodies remain accepted. Unknown context fields, unsupported protocols and out-of-bounds token traits are rejected.

**Supported scope:** implemented
