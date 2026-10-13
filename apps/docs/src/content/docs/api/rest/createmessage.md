---
title: "Create a native text Message, optionally streamed"
description: "POST /v1/messages"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/messages`

Requires supports_messages on an OpenRouter or Anthropic route. Uses Niu bearer or x-niu-api-key credentials, workspace grants, source policy, limits, guardrails and billing. Requests are limited to 64 KiB and conservative configured pricing bounds. No Chat translation. Media, beta headers and unsupported fields are rejected before dispatch. Buffered client tools require supports_messages_tools; route pools filter this capability. Tool definitions are limited to name, description and bounded offline object input_schema. tool_choice supports auto/any/none/tool and optional disable_parallel_tool_use. History requires uniquely identified assistant tool_use blocks followed immediately by matching user tool_result blocks with string content, before ordinary user text. Tools must remain declared for tool history. Streaming tools additionally require supports_messages_streaming_tools, supports_messages_tools and supports_messages_streaming; pools filter all required capabilities. Only sequential content blocks are supported; interleaved tool blocks fail safely. Native input_json_delta fragments are bounded to 64 KiB per tool and 256 KiB per message, parsed and schema-validated before content_block_stop is emitted. Tool IDs must be unique. Consumers must wait for message_stop before executing tool calls; error events and incomplete streams do not establish valid completion. Tool names, IDs and arguments are validated and projected; Niu does not execute tools. Required text input/output inspection rejects tool requests before dispatch rather than silently skipping tool content. A tool_use stop is a completed provider turn, not completion of a client task. Only version 2023-06-01 is supported (also used when omitted). Native input_tokens excludes cache reads/writes; total input accounting requires all three input categories plus output_tokens. Missing or null categories leave usage unresolved and reservations retained. Separate reasoning rates in the bound base price or a reachable context tier are rejected atomically before dispatch with 422 and x-niu-error-code unsupported_token_pricing; this adapter cannot report reasoning usage. Returned usage is not proof of a settled charge. Upstream commercial metadata is never forwarded. Native SDK and Claude Code compatibility are unverified. Streaming additionally requires supports_messages_streaming. Route pools filter this capability before priority/weight selection; no eligible candidate returns 503 before dispatch. Native SSE validates ordered text and opted-in tool events and projects customer-safe fields with a 64 KiB per-event limit. Completion requires message_stop; missing terminal evidence, upstream interruption and client cancellation retain uncertainty and reservations. Cumulative usage updates replace earlier counts; never sum deltas or infer missing categories. HTTP 200 alone is not completed usage. No credential switch or inference retry after headers. Required output inspection rejects streaming before dispatch. SDK messages.stream() stops at message_stop; an upstream extra [DONE] is not forwarded.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/messages" \
  -H "Authorization: Bearer $NIU_API_KEY" \
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
                        }
                      }
                    },
                    {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "type",
                        "tool_use_id",
                        "content"
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
                          "type": "string"
                        },
                        "is_error": {
                          "type": "boolean"
                        }
                      }
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
  }
}
```

## Behavior and supported scope

Requires supports_messages on an OpenRouter or Anthropic route. Uses Niu bearer or x-niu-api-key credentials, workspace grants, source policy, limits, guardrails and billing. Requests are limited to 64 KiB and conservative configured pricing bounds. No Chat translation. Media, beta headers and unsupported fields are rejected before dispatch. Buffered client tools require supports_messages_tools; route pools filter this capability. Tool definitions are limited to name, description and bounded offline object input_schema. tool_choice supports auto/any/none/tool and optional disable_parallel_tool_use. History requires uniquely identified assistant tool_use blocks followed immediately by matching user tool_result blocks with string content, before ordinary user text. Tools must remain declared for tool history. Streaming tools additionally require supports_messages_streaming_tools, supports_messages_tools and supports_messages_streaming; pools filter all required capabilities. Only sequential content blocks are supported; interleaved tool blocks fail safely. Native input_json_delta fragments are bounded to 64 KiB per tool and 256 KiB per message, parsed and schema-validated before content_block_stop is emitted. Tool IDs must be unique. Consumers must wait for message_stop before executing tool calls; error events and incomplete streams do not establish valid completion. Tool names, IDs and arguments are validated and projected; Niu does not execute tools. Required text input/output inspection rejects tool requests before dispatch rather than silently skipping tool content. A tool_use stop is a completed provider turn, not completion of a client task. Only version 2023-06-01 is supported (also used when omitted). Native input_tokens excludes cache reads/writes; total input accounting requires all three input categories plus output_tokens. Missing or null categories leave usage unresolved and reservations retained. Separate reasoning rates in the bound base price or a reachable context tier are rejected atomically before dispatch with 422 and x-niu-error-code unsupported_token_pricing; this adapter cannot report reasoning usage. Returned usage is not proof of a settled charge. Upstream commercial metadata is never forwarded. Native SDK and Claude Code compatibility are unverified. Streaming additionally requires supports_messages_streaming. Route pools filter this capability before priority/weight selection; no eligible candidate returns 503 before dispatch. Native SSE validates ordered text and opted-in tool events and projects customer-safe fields with a 64 KiB per-event limit. Completion requires message_stop; missing terminal evidence, upstream interruption and client cancellation retain uncertainty and reservations. Cumulative usage updates replace earlier counts; never sum deltas or infer missing categories. HTTP 200 alone is not completed usage. No credential switch or inference retry after headers. Required output inspection rejects streaming before dispatch. SDK messages.stream() stops at message_stop; an upstream extra [DONE] is not forwarded.

**Supported scope:** implemented

**Supported scope:** Native text and client tools with separately enabled text/tool streaming. Media and extended thinking remain unsupported.
