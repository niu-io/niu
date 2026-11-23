---
title: "Create a native Message, optionally streamed"
description: "POST /v1/messages"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

`POST /v1/messages`

Requires supports_messages on an OpenRouter or Anthropic route. Accepts version 2023-06-01 (default when omitted) and safe capability anthropic-beta tokens (prompt-caching-2024-07-31, token-efficient-tools-2025-02-19, interleaved-thinking-2025-05-14, fine-grained-tool-streaming-2025-05-14, output-128k-2025-02-19, pdfs-2024-09-25, extended-cache-ttl-2025-04-11; host marker claude-code-20250219 is stripped; unknown or hosted-tool betas return 501). Supports Extended Thinking (thinking enabled/disabled/adaptive and output_config.effort), top_k, metadata.user_id, client function tools (auto/any/none/tool, string or bounded array tool_result.content, cache_control on tools and tool blocks), thinking/redacted_thinking history blocks, and unpriced user image/document blocks (8 MiB body cap; rejected with 400 on priced routes which keep a 1 MiB limit). Streaming enforces per-event bounds (256 KiB) and validates cumulative usage before completion.

Operation: `createMessage`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/messages" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/messages" \
  -H "X-Niu-API-Key: $NIU_API_KEY" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### anthropic-version

Location: **header**. Optional.

```json
{
  "type": "string",
  "enum": [
    "2023-06-01"
  ]
}
```

### anthropic-beta

Location: **header**. Optional. Optional comma-separated safe Anthropic beta flags. Unknown or hosted-tool betas are rejected with 501.

```json
{
  "type": "string"
}
```

### x-niu-evaluation

Location: **header**. Optional. Opt-in evaluation-slug@revision/sample binding. Requires current evaluations:read delegation and the pinned protocol-bound effective request hash. A mismatch is rejected before dispatch. Not forwarded upstream. This is not idempotency or authority for a paid evaluation budget; discover admitted attempts after an uncertain response before considering replay. Untagged requests do not establish verified sample equivalence.

```json
{
  "type": "string",
  "maxLength": 200,
  "pattern": "^[a-z0-9]+(-[a-z0-9]+)*@[1-9][0-9]*/[A-Za-z0-9_.-]+$"
}
```

### x-niu-routing-context

Location: **header**. Optional. Optional bounded JSON task context for an explicitly selected semantic Auto policy, for example {"task":"coding","stage":"implementation"}. task and stage are lowercase tokens of at most 64 characters. Unknown fields, repeated headers and malformed values are rejected before selection. The value is not forwarded upstream; a configured decider receives only the validated context and declared path metadata, never conversation content. Present but invalid context is rejected even when the selected policy is not Auto.

```json
{
  "type": "string",
  "maxLength": 512
}
```

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "model",
    "max_tokens",
    "messages"
  ],
  "properties": {
    "model": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "max_tokens": {
      "type": "integer",
      "minimum": 1,
      "maximum": 1000000
    },
    "system": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "array",
          "minItems": 1,
          "maxItems": 128,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "text"
            ],
            "properties": {
              "type": {
                "type": "string",
                "enum": [
                  "text"
                ]
              },
              "text": {
                "type": "string"
              },
              "cache_control": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "type"
                ],
                "properties": {
                  "type": {
                    "type": "string",
                    "enum": [
                      "ephemeral"
                    ]
                  },
                  "ttl": {
                    "type": "string",
                    "enum": [
                      "5m",
                      "1h"
                    ]
                  }
                }
              }
            }
          }
        }
      ]
    },
    "stream": {
      "type": "boolean",
      "default": false
    },
    "temperature": {
      "type": "number",
      "minimum": 0,
      "maximum": 1
    },
    "top_p": {
      "type": "number",
      "minimum": 0,
      "maximum": 1
    },
    "top_k": {
      "type": "integer",
      "minimum": 0,
      "maximum": 10000
    },
    "thinking": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "type"
          ],
          "properties": {
            "type": {
              "type": "string",
              "enum": [
                "disabled",
                "adaptive"
              ]
            }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "type",
            "budget_tokens"
          ],
          "properties": {
            "type": {
              "type": "string",
              "const": "enabled"
            },
            "budget_tokens": {
              "type": "integer",
              "minimum": 1024,
              "maximum": 1000000
            }
          }
        }
      ]
    },
    "output_config": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "effort": {
          "type": "string",
          "enum": [
            "low",
            "medium",
            "high",
            "max"
          ]
        }
      }
    },
    "metadata": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "user_id": {
          "type": "string",
          "maxLength": 512
        }
      }
    },
    "stop_sequences": {
      "type": "array",
      "maxItems": 4,
      "items": {
        "type": "string",
        "minLength": 1,
        "maxLength": 512
      }
    },
    "messages": {
      "type": "array",
      "minItems": 1,
      "maxItems": 1024,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "role",
          "content"
        ],
        "properties": {
          "role": {
            "type": "string",
            "enum": [
              "user",
              "assistant"
            ]
          },
          "content": {
            "oneOf": [
              {
                "type": "string"
              },
              {
                "type": "array",
                "minItems": 1,
                "maxItems": 128,
                "items": {
                  "oneOf": [
                    {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "type",
                        "text"
                      ],
                      "properties": {
                        "type": {
                          "type": "string",
                          "enum": [
                            "text"
                          ]
                        },
                        "text": {
                          "type": "string"
                        },
                        "cache_control": {
                          "type": "object",
                          "additionalProperties": false,
                          "required": [
                            "type"
                          ],
                          "properties": {
                            "type": {
                              "type": "string",
                              "enum": [
                                "ephemeral"
                              ]
                            },
                            "ttl": {
                              "type": "string",
                              "enum": [
                                "5m",
                                "1h"
                              ]
                            }
                          }
                        }
                      }
                    },
                    {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "type",
                        "id",
                        "name",
                        "input"
                      ],
                      "properties": {
                        "type": {
                          "const": "tool_use"
                        },
                        "id": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 200
                        },
                        "name": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 64,
                          "pattern": "^[A-Za-z0-9_-]+$"
                        },
                        "input": {
                          "type": "object"
                        },
                        "cache_control": {
                          "type": "object"
                        }
                      }
                    },
                    {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "type",
                        "tool_use_id"
                      ],
                      "properties": {
                        "type": {
                          "const": "tool_result"
                        },
                        "tool_use_id": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 200
                        },
                        "content": {
                          "oneOf": [
                            {
                              "type": "string"
                            },
                            {
                              "type": "array",
                              "items": {
                                "type": "object"
                              }
                            }
                          ]
                        },
                        "is_error": {
                          "type": "boolean"
                        },
                        "cache_control": {
                          "type": "object"
                        }
                      }
                    },
                    {
                      "type": "object",
                      "required": [
                        "type"
                      ],
                      "properties": {
                        "type": {
                          "type": "string",
                          "enum": [
                            "image",
                            "document",
                            "thinking",
                            "redacted_thinking"
                          ]
                        }
                      },
                      "additionalProperties": true
                    }
                  ]
                }
              }
            ]
          }
        }
      }
    },
    "tools": {
      "type": "array",
      "minItems": 1,
      "maxItems": 64,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "name",
          "input_schema"
        ],
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 64,
            "pattern": "^[A-Za-z0-9_-]+$"
          },
          "description": {
            "type": "string"
          },
          "input_schema": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "object"
              }
            },
            "additionalProperties": true
          },
          "cache_control": {
            "type": "object"
          }
        }
      }
    },
    "tool_choice": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "enum": [
            "auto",
            "any",
            "none",
            "tool"
          ]
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 64,
          "pattern": "^[A-Za-z0-9_-]+$"
        },
        "disable_parallel_tool_use": {
          "type": "boolean"
        }
      }
    }
  }
}
```

## Responses

### HTTP 200

Native sanitized Message or opted-in text SSE. Tool turns may require a client continuation. Inspect usage and billing diagnostics separately.

Response headers:

```json
{
  "x-niu-attempt-id": {
    "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  },
  "x-niu-operation-id": {
    "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "type",
    "role",
    "model",
    "content",
    "stop_reason",
    "stop_sequence",
    "usage"
  ],
  "properties": {
    "id": {
      "type": "string"
    },
    "type": {
      "type": "string",
      "enum": [
        "message"
      ]
    },
    "role": {
      "type": "string",
      "enum": [
        "assistant"
      ]
    },
    "model": {
      "type": "string"
    },
    "content": {
      "type": "array",
      "minItems": 1,
      "maxItems": 128,
      "items": {
        "oneOf": [
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "text"
            ],
            "properties": {
              "type": {
                "type": "string",
                "enum": [
                  "text"
                ]
              },
              "text": {
                "type": "string"
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id",
              "name",
              "input"
            ],
            "properties": {
              "type": {
                "const": "tool_use"
              },
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "name": {
                "type": "string",
                "minLength": 1,
                "maxLength": 64,
                "pattern": "^[A-Za-z0-9_-]+$"
              },
              "input": {
                "type": "object"
              }
            }
          }
        ]
      }
    },
    "stop_reason": {
      "type": "string",
      "enum": [
        "end_turn",
        "max_tokens",
        "stop_sequence",
        "tool_use"
      ]
    },
    "stop_sequence": {
      "type": [
        "string",
        "null"
      ]
    },
    "usage": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "input_tokens",
        "output_tokens",
        "cache_creation_input_tokens",
        "cache_read_input_tokens"
      ],
      "properties": {
        "input_tokens": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 0
        },
        "output_tokens": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 0
        },
        "cache_creation_input_tokens": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 0
        },
        "cache_read_input_tokens": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 0
        }
      }
    }
  }
}
```

Content type: `text/event-stream`.

```json
{
  "type": "string",
  "description": "Native message_start, text content block events, cumulative message_delta and message_stop. Sanitized error events terminate failed streams."
}
```

### HTTP 400

Invalid or unsupported input.

Response headers:

```json
{
  "x-niu-error-code": {
    "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
    "schema": {
      "type": "string"
    }
  },
  "x-niu-attempt-id": {
    "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  },
  "x-niu-operation-id": {
    "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

### HTTP 401

Invalid Niu key.

Response headers:

```json
{
  "x-niu-error-code": {
    "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
    "schema": {
      "type": "string"
    }
  },
  "x-niu-attempt-id": {
    "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  },
  "x-niu-operation-id": {
    "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

### HTTP 402

Insufficient spending capacity.

Response headers:

```json
{
  "x-niu-error-code": {
    "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
    "schema": {
      "type": "string"
    }
  },
  "x-niu-attempt-id": {
    "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  },
  "x-niu-operation-id": {
    "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

### HTTP 403

Input or output policy denial.

Response headers:

```json
{
  "x-niu-error-code": {
    "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
    "schema": {
      "type": "string"
    }
  },
  "x-niu-attempt-id": {
    "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  },
  "x-niu-operation-id": {
    "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

### HTTP 404

Model unavailable or outside key grants.

Response headers:

```json
{
  "x-niu-error-code": {
    "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
    "schema": {
      "type": "string"
    }
  },
  "x-niu-attempt-id": {
    "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  },
  "x-niu-operation-id": {
    "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

### HTTP 422

Bound pricing requires unsupported token usage categories. No upstream dispatch or balance reservation is committed.

Response headers:

```json
{
  "x-niu-error-code": {
    "schema": {
      "type": "string",
      "enum": [
        "unsupported_token_pricing"
      ]
    }
  },
  "x-niu-attempt-id": {
    "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  },
  "x-niu-operation-id": {
    "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

### HTTP 429

Key rate, concurrency or token limit.

Response headers:

```json
{
  "x-niu-error-code": {
    "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
    "schema": {
      "type": "string"
    }
  },
  "x-niu-attempt-id": {
    "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  },
  "x-niu-operation-id": {
    "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

### HTTP 501

Unsupported streaming, version or capability.

Response headers:

```json
{
  "x-niu-error-code": {
    "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
    "schema": {
      "type": "string"
    }
  },
  "x-niu-attempt-id": {
    "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  },
  "x-niu-operation-id": {
    "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

### HTTP 502

Upstream failure or invalid response; execution may be uncertain.

Response headers:

```json
{
  "x-niu-error-code": {
    "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
    "schema": {
      "type": "string"
    }
  },
  "x-niu-attempt-id": {
    "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  },
  "x-niu-operation-id": {
    "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

### HTTP 503

Service unavailable.

Response headers:

```json
{
  "x-niu-error-code": {
    "description": "Niu-specific machine-readable reason, such as key_spending_limit_exceeded or budget_exceeded. Native error.type remains the native category. Shared middleware errors may omit this header.",
    "schema": {
      "type": "string"
    }
  },
  "x-niu-attempt-id": {
    "description": "Niu attempt UUID, available once an attempt has been dispatched. Use this reference with GET /v1/generations/{id}; it is distinct from an upstream response ID. May be absent on early rejection.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  },
  "x-niu-operation-id": {
    "description": "Niu operation UUID grouping the request execution. Distinct from the attempt UUID; may be absent before dispatch.",
    "schema": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

## Behavior and supported scope

Requires supports_messages on an OpenRouter or Anthropic route. Accepts version 2023-06-01 (default when omitted) and safe capability anthropic-beta tokens (prompt-caching-2024-07-31, token-efficient-tools-2025-02-19, interleaved-thinking-2025-05-14, fine-grained-tool-streaming-2025-05-14, output-128k-2025-02-19, pdfs-2024-09-25, extended-cache-ttl-2025-04-11; host marker claude-code-20250219 is stripped; unknown or hosted-tool betas return 501). Supports Extended Thinking (thinking enabled/disabled/adaptive and output_config.effort), top_k, metadata.user_id, client function tools (auto/any/none/tool, string or bounded array tool_result.content, cache_control on tools and tool blocks), thinking/redacted_thinking history blocks, and unpriced user image/document blocks (8 MiB body cap; rejected with 400 on priced routes which keep a 1 MiB limit). Streaming enforces per-event bounds (256 KiB) and validates cumulative usage before completion.

**Supported scope:** implemented

**Supported scope:** Native Anthropic Messages with streaming, client tools, Extended Thinking, cache_control, unpriced image/PDF blocks, and safe anthropic-beta forwarding. output_config.format remains unsupported.
