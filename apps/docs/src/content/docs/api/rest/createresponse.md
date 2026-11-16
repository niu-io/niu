---
title: "Create a native OpenAI Response"
description: "POST /v1/responses"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/responses`

Requires an OpenAI-compatible route with supports_responses enabled. Supports single-turn string input and stateless multi-turn input arrays containing user/system/developer/assistant messages, function_call and matched function_call_output history items, reasoning items, and unpriced input_image parts (max 8 MiB request body; priced routes reject vision inputs and remain bounded to 1 MiB text/tool requests). Client function tools require supports_tool_calls (plus supports_streaming_tool_calls when streaming); structured output (text.format json_object or json_schema) requires supports_structured_output; reasoning effort/summary checks catalog capability when declared. Niu validates declared schemas offline and never executes tools or stores prior responses on the server: store must be absent or false, and previous_response_id, conversation, background, and hosted server tools are rejected explicitly. Streaming emits Responses SSE events and validates terminal output before settlement; disconnects retain holds and uncertainty.

Operation: `createResponse`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/responses" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/responses" \
  -H "X-Niu-API-Key: $NIU_API_KEY" \
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
    "input"
  ],
  "properties": {
    "model": {
      "type": "string",
      "minLength": 1
    },
    "input": {
      "oneOf": [
        {
          "type": "string",
          "minLength": 1
        },
        {
          "type": "array",
          "minItems": 1,
          "maxItems": 256,
          "items": {
            "type": "object"
          }
        }
      ]
    },
    "instructions": {
      "type": "string"
    },
    "max_output_tokens": {
      "type": "integer",
      "minimum": 1,
      "maximum": 1000000
    },
    "temperature": {
      "type": "number",
      "minimum": 0,
      "maximum": 2
    },
    "top_p": {
      "type": "number",
      "minimum": 0,
      "maximum": 1
    },
    "metadata": {
      "type": "object",
      "maxProperties": 16,
      "additionalProperties": {
        "type": "string",
        "maxLength": 512
      }
    },
    "user": {
      "type": "string",
      "maxLength": 512
    },
    "tools": {
      "type": "array",
      "minItems": 1,
      "maxItems": 128,
      "items": {
        "type": "object",
        "required": [
          "type",
          "name"
        ],
        "properties": {
          "type": {
            "type": "string",
            "const": "function"
          },
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 64
          },
          "description": {
            "type": "string",
            "maxLength": 4096
          },
          "parameters": {
            "type": "object"
          },
          "strict": {
            "type": "boolean"
          }
        }
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
            "name"
          ],
          "properties": {
            "type": {
              "type": "string",
              "const": "function"
            },
            "name": {
              "type": "string"
            }
          }
        }
      ]
    },
    "parallel_tool_calls": {
      "type": "boolean"
    },
    "text": {
      "type": "object",
      "properties": {
        "verbosity": {
          "type": "string",
          "enum": [
            "low",
            "medium",
            "high"
          ]
        },
        "format": {
          "type": "object"
        }
      }
    },
    "reasoning": {
      "type": "object",
      "properties": {
        "effort": {
          "type": "string",
          "enum": [
            "minimal",
            "low",
            "medium",
            "high"
          ]
        },
        "summary": {
          "type": "string",
          "enum": [
            "auto",
            "concise",
            "detailed"
          ]
        }
      }
    },
    "truncation": {
      "type": "string",
      "enum": [
        "disabled",
        "auto"
      ]
    },
    "store": {
      "type": "boolean",
      "enum": [
        false
      ]
    },
    "stream": {
      "type": "boolean",
      "default": false
    }
  }
}
```

## Responses

### HTTP 200

A validated Responses API text response with the public model alias.

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
  "required": [
    "id",
    "object",
    "status",
    "model",
    "output"
  ],
  "properties": {
    "id": {
      "type": "string",
      "minLength": 1
    },
    "object": {
      "type": "string",
      "const": "response"
    },
    "status": {
      "type": "string",
      "enum": [
        "completed",
        "incomplete"
      ]
    },
    "model": {
      "type": "string"
    },
    "output": {
      "type": "array",
      "minItems": 1,
      "items": {
        "oneOf": [
          {
            "type": "object",
            "required": [
              "type",
              "role",
              "content"
            ],
            "properties": {
              "id": {
                "type": "string"
              },
              "type": {
                "type": "string",
                "const": "message"
              },
              "role": {
                "type": "string",
                "const": "assistant"
              },
              "status": {
                "type": "string"
              },
              "content": {
                "type": "array",
                "minItems": 1,
                "items": {
                  "oneOf": [
                    {
                      "type": "object",
                      "required": [
                        "type",
                        "text"
                      ],
                      "properties": {
                        "type": {
                          "type": "string",
                          "const": "output_text"
                        },
                        "text": {
                          "type": "string"
                        },
                        "annotations": {
                          "type": "array",
                          "items": {
                            "type": "object"
                          }
                        }
                      },
                      "additionalProperties": true
                    },
                    {
                      "type": "object",
                      "required": [
                        "type",
                        "refusal"
                      ],
                      "properties": {
                        "type": {
                          "type": "string",
                          "const": "refusal"
                        },
                        "refusal": {
                          "type": "string"
                        }
                      },
                      "additionalProperties": true
                    }
                  ]
                }
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
              "id": {
                "type": "string"
              },
              "type": {
                "type": "string",
                "const": "reasoning"
              },
              "summary": {
                "type": "array"
              },
              "encrypted_content": {
                "type": "string"
              }
            },
            "additionalProperties": true
          },
          {
            "type": "object",
            "required": [
              "type",
              "call_id",
              "name",
              "arguments"
            ],
            "properties": {
              "id": {
                "type": "string"
              },
              "type": {
                "type": "string",
                "const": "function_call"
              },
              "call_id": {
                "type": "string"
              },
              "name": {
                "type": "string"
              },
              "arguments": {
                "type": "string"
              },
              "status": {
                "type": "string"
              }
            },
            "additionalProperties": true
          }
        ]
      }
    },
    "usage": {
      "type": "object",
      "required": [
        "input_tokens",
        "output_tokens"
      ],
      "properties": {
        "input_tokens": {
          "type": "integer",
          "minimum": 0
        },
        "output_tokens": {
          "type": "integer",
          "minimum": 0
        },
        "total_tokens": {
          "type": "integer",
          "minimum": 0
        }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": true
}
```

Content type: `text/event-stream`.

```json
{
  "type": "string"
}
```

### HTTP 400

Invalid body, unsupported field or invalid request shape.

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

### HTTP 401

Missing or invalid gateway credentials.

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

### HTTP 402

Insufficient balance or spending limit exceeded.

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

### HTTP 403

Source IP or enforced policy denies the request. Recorded preparation-policy refusals use error.type guardrail_denied before model dispatch; post-dispatch output withholding uses guardrail_output_withheld and generation charges may apply. Do not classify every 403 as a Guardrail refusal.

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

### HTTP 404

Model alias does not exist or is unavailable to this key.

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

### HTTP 409

Admission conflict before dispatch. Type route_configuration_changed identifies a changed managed credential/model configuration; that request was not sent upstream. Other conflicts retain their own error type.

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

### HTTP 413

Request body exceeds 1 MiB; rejected before inference whether payload capture is enabled or disabled. Framework responses may use a plain-text body.

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

### HTTP 422

Invalid JSON or unsupported token admission/pricing requirements. Responses reads explicit input_tokens_details.cache_write_tokens alongside cache reads and reasoning output; missing categories remain unknown. Separate rates for unavailable categories in a bound base or reachable tier schedule return unsupported_token_pricing before dispatch or reservation commits.

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

### HTTP 429

API key request, concurrency or token rate limit exceeded.

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

### HTTP 501

Responses support is disabled, the route protocol is unsupported, or the requested feature is unsupported. The unsupported_operation_error message identifies the limitation and supported alternative before admission.

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

### HTTP 502

Provider request failed or returned an invalid text response. Valid terminal usage is retained for accounting even when output delivery is rejected; an HTTP error alone does not prove nonexecution or authorize a safe retry.

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

### HTTP 503

Durable storage or configured route unavailable.

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

## Behavior and supported scope

Requires an OpenAI-compatible route with supports_responses enabled. Supports single-turn string input and stateless multi-turn input arrays containing user/system/developer/assistant messages, function_call and matched function_call_output history items, reasoning items, and unpriced input_image parts (max 8 MiB request body; priced routes reject vision inputs and remain bounded to 1 MiB text/tool requests). Client function tools require supports_tool_calls (plus supports_streaming_tool_calls when streaming); structured output (text.format json_object or json_schema) requires supports_structured_output; reasoning effort/summary checks catalog capability when declared. Niu validates declared schemas offline and never executes tools or stores prior responses on the server: store must be absent or false, and previous_response_id, conversation, background, and hosted server tools are rejected explicitly. Streaming emits Responses SSE events and validates terminal output before settlement; disconnects retain holds and uncertainty.

**Supported scope:** implemented

**Supported scope:** Stateless OpenAI Responses API supporting multi-turn item arrays, client function tools and tool loops, structured JSON Schema output, reasoning effort/summary, truncation, and unpriced input_image inputs (8 MiB body limit; priced routes remain text/tool-only within 1 MiB). Hosted server tools and server-stored state (previous_response_id, store: true) remain unsupported.
