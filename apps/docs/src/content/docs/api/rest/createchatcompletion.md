---
title: "Create an OpenAI-compatible chat completion"
description: "POST /v1/chat/completions"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/chat/completions`

Uses the workspace API key and its model grants, source policy, rate/concurrency/token limits and configured billing. Streaming HTTP 200 starts delivery; completion and reported usage require the terminal stream evidence. Niu does not execute function tools. See the supported scope below for structured output and modality restrictions.

Operation: `createChatCompletion`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/chat/completions" \
  -H "Authorization: Bearer $NIU_API_KEY" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### x-niu-log-payloads

Location: **header**. Optional. Request and sanitized customer response content is retained until 24 hours after the original request creation time by default. Send false (case-insensitive) to disable capture for this request; true or an omitted header retains content. Invalid values or repeated headers are rejected before inference. Requests exceeding the 1 MB capture limit are rejected; response capture is truncated at 1 MB. Does not backfill earlier requests.

```json
{
  "type": "string",
  "enum": [
    "true",
    "false"
  ],
  "default": "true"
}
```

### X-Niu-Task-ID

Location: **header**. Optional. Optional opaque task correlation key. Requests with the same value can be grouped in workspace activity. Niu stores the value as metadata and does not forward it to the provider.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 200,
  "pattern": "^[!-~]{1,200}$"
}
```

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "required": [
    "model",
    "messages"
  ],
  "properties": {
    "model": {
      "type": "string"
    },
    "messages": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "tools": {
      "type": "array",
      "minItems": 1,
      "maxItems": 128,
      "items": {
        "type": "object",
        "required": [
          "type",
          "function"
        ],
        "properties": {
          "type": {
            "type": "string",
            "const": "function"
          },
          "function": {
            "type": "object",
            "required": [
              "name"
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
              "parameters": {
                "type": "object",
                "description": "JSON Schema object forwarded to the configured provider.",
                "additionalProperties": true
              },
              "strict": {
                "type": "boolean"
              }
            },
            "additionalProperties": true
          }
        },
        "additionalProperties": true
      }
    },
    "tool_choice": {
      "oneOf": [
        {
          "type": "string",
          "enum": [
            "none",
            "auto",
            "required"
          ]
        },
        {
          "type": "object",
          "required": [
            "type",
            "function"
          ],
          "properties": {
            "type": {
              "type": "string",
              "const": "function"
            },
            "function": {
              "type": "object",
              "required": [
                "name"
              ],
              "properties": {
                "name": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 64
                }
              }
            }
          },
          "additionalProperties": true
        }
      ]
    },
    "parallel_tool_calls": {
      "type": "boolean"
    },
    "response_format": {
      "oneOf": [
        {
          "type": "object",
          "required": [
            "type"
          ],
          "properties": {
            "type": {
              "type": "string",
              "const": "text"
            }
          },
          "additionalProperties": true
        },
        {
          "type": "object",
          "required": [
            "type"
          ],
          "properties": {
            "type": {
              "type": "string",
              "const": "json_object"
            }
          },
          "additionalProperties": true
        },
        {
          "type": "object",
          "required": [
            "type",
            "json_schema"
          ],
          "properties": {
            "type": {
              "type": "string",
              "const": "json_schema"
            },
            "json_schema": {
              "type": "object",
              "required": [
                "name",
                "schema"
              ],
              "properties": {
                "name": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 64
                },
                "description": {
                  "type": "string"
                },
                "strict": {
                  "type": "boolean"
                },
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              },
              "additionalProperties": true
            }
          },
          "additionalProperties": true
        }
      ],
      "description": "Buffered and streamed structured JSON are supported on explicitly enabled priced text routes. Serialized response-format instructions count toward the route input byte guard alongside messages; this guard is not a provider tokenizer or a guarantee against reported overruns."
    },
    "temperature": {
      "type": [
        "number",
        "null"
      ],
      "minimum": 0,
      "maximum": 2
    },
    "top_p": {
      "type": [
        "number",
        "null"
      ],
      "minimum": 0,
      "maximum": 1
    },
    "frequency_penalty": {
      "type": [
        "number",
        "null"
      ],
      "minimum": -2,
      "maximum": 2
    },
    "presence_penalty": {
      "type": [
        "number",
        "null"
      ],
      "minimum": -2,
      "maximum": 2
    },
    "reasoning": {
      "type": "object",
      "description": "Priced Chat supports explicit reasoning budgets on OpenRouter routes. max_tokens must be a positive integer strictly below the total output limit; it is a subset of that limit. exclude controls whether upstream reasoning text is requested in the response. Other reasoning options on priced routes are rejected. Model support remains upstream-specific.",
      "required": [
        "max_tokens"
      ],
      "additionalProperties": false,
      "properties": {
        "max_tokens": {
          "type": "integer",
          "minimum": 1
        },
        "exclude": {
          "type": "boolean"
        }
      }
    },
    "max_tokens": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": 1,
      "maximum": 9223372036854776000
    },
    "max_completion_tokens": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": 1,
      "maximum": 9223372036854776000
    },
    "n": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": 1,
      "maximum": 9223372036854776000
    },
    "seed": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": -9223372036854776000,
      "maximum": 9223372036854776000
    },
    "stream": {
      "type": "boolean"
    },
    "stream_options": {
      "type": [
        "object",
        "null"
      ],
      "properties": {
        "include_usage": {
          "type": "boolean"
        }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": true
}
```

## Responses

### HTTP 200

A normalized chat completion or compatible event stream.

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string"
    },
    "object": {
      "type": "string",
      "const": "chat.completion"
    },
    "model": {
      "type": "string",
      "description": "Public model alias."
    },
    "created": {
      "type": "integer"
    },
    "choices": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "index": {
            "type": "integer",
            "minimum": 0
          },
          "finish_reason": {
            "type": [
              "string",
              "null"
            ]
          },
          "message": {
            "type": "object",
            "properties": {
              "role": {
                "type": "string"
              },
              "content": {
                "description": "Usually text or null for a function call; extensions remain provider-specific."
              },
              "refusal": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "tool_calls": {
                "type": [
                  "array",
                  "null"
                ],
                "items": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string"
                    },
                    "type": {
                      "type": "string",
                      "const": "function"
                    },
                    "function": {
                      "type": "object",
                      "properties": {
                        "name": {
                          "type": "string"
                        },
                        "arguments": {
                          "type": "string",
                          "description": "JSON-encoded function arguments; Niu does not execute the function."
                        }
                      },
                      "required": [
                        "name",
                        "arguments"
                      ]
                    }
                  },
                  "required": [
                    "id",
                    "type",
                    "function"
                  ]
                }
              }
            }
          }
        },
        "required": [
          "message"
        ]
      }
    },
    "usage": {
      "description": "Optional provider token usage. Its presence alone does not guarantee complete valid accounting evidence. Customer charges must be read from billing APIs, never inferred from missing counters."
    }
  },
  "description": "Nonstreaming completion envelope. Provider extension fields may be present. Missing usage is unknown, not zero.",
  "required": [
    "object",
    "model",
    "choices"
  ]
}
```

Content type: `text/event-stream`.

```json
{
  "type": "string",
  "description": "Chat completion SSE chunks. HTTP 200 starts the stream; preserve terminal evidence and optional usage rather than treating a disconnected stream as complete."
}
```

### HTTP 400

Invalid request, generation-parameter type or range, or unsupported operation; rejected before admission and Provider dispatch.

### HTTP 401

Missing or invalid gateway credentials.

### HTTP 402

Insufficient balance or spending limit exceeded.

### HTTP 403

Source IP or enforced policy denies the request. Recorded preparation-policy refusals use error.type guardrail_denied before model dispatch; post-dispatch output withholding uses guardrail_output_withheld and generation charges may apply. Do not classify every 403 as a Guardrail refusal.

### HTTP 409

Admission conflict before dispatch. Type route_configuration_changed identifies a changed managed credential/model configuration; that request was not sent upstream. Other conflicts retain their own error type.

### HTTP 413

Request body exceeds 1 MiB; rejected before inference whether payload capture is enabled or disabled. Framework responses may use a plain-text body.

### HTTP 422

Configured pricing requires an unavailable token category (unsupported_token_pricing), or a token admission bound is unavailable. Chat reads explicit prompt_tokens_details.cache_write_tokens as a subset of total input, alongside cache reads and reasoning output; missing categories remain unknown. Priced text content blocks accept bounded ephemeral cache_control metadata.

### HTTP 429

API key request, concurrency or token rate limit exceeded.

### HTTP 501

Tool or structured-output capability is disabled, or the requested combination is unsupported. The unsupported_operation_error message identifies the feature and a supported request alternative; rejection occurs before admission or upstream dispatch.

### HTTP 502

Provider request failed.

### HTTP 503

Durable storage or configured route unavailable. guardrail_output_busy identifies exhausted full-output collection capacity before admission or dispatch.

## Behavior and supported scope

Uses the workspace API key and its model grants, source policy, rate/concurrency/token limits and configured billing. Streaming HTTP 200 starts delivery; completion and reported usage require the terminal stream evidence. Niu does not execute function tools. See the supported scope below for structured output and modality restrictions.

**Supported scope:** implemented

**Supported scope:** Basic chat is implemented for configured native provider routes. Local buffered_full output rules support single-choice plain text streaming: retain the real upstream stream until terminal evidence, inspect the complete bounded output, then emit compatible sanitized chunks. Required output withholding emits a guardrail_output_withheld SSE error without [DONE]; known executed usage remains billable. Text buffering is limited to 1 MiB and total stream bytes to 2 MiB, with four concurrent collectors per process. Output rules with tools or structured format remain unsupported. Observation-only plain-text streams preserve delivery and asynchronously record clear, matched or indeterminate without transforming output. Mandatory and observation rules compose across workspace/key scopes. Optional collection and inspection have separate bounded capacity; observation overload does not deny the request. Function tools, streaming tool deltas, and structured JSON are opt-in on OpenAI-compatible routes only. Niu validates tool-call shape and structured JSON against a valid self-contained schema; json_object output must be an object. Schema compilation is offline and limited to 64 KiB, 4096 JSON nodes and depth 32, with bounded regular expressions. Niu does not execute tools. Structured JSON streaming validates assembled output before releasing [DONE], with a 1 MiB total content/refusal bound and at most 128 choices. Partial deltas are provisional; invalid final output sends an upstream_invalid_response SSE error without [DONE], while reported terminal usage remains accounting evidence. Token-priced routes support function calls and text-only tool-result conversations under the same input/output rates. Serialized messages, tool definitions, tool choices and response-format instructions count toward the configured input byte guard. Hosted tools and additional billable modalities remain unsupported. Chat pools allow at most one different-credential successor after a canonical OpenRouter immediate HTTP 401 with durable nonexecution and released holds, preserving operation price and funding under one deadline. Other errors and streams already returned to the client are not retried.
