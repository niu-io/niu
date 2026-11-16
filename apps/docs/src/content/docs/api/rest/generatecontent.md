---
title: "Generate native Gemini content or streamGenerateContent"
description: "POST /v1beta/models/{model_action}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1beta/models/{model_action}`

Requires provider gemini with supports_generate_content enabled; streaming additionally requires supports_generate_content_streaming. model_action accepts {model}:generateContent or {model}:streamGenerateContent (URL-encode slashes inside aliases). Streaming returns JSON array chunks by default or SSE when ?alt=sse is supplied; query ?key= is rejected (use Authorization: Bearer or x-niu-api-key). Supports client functionDeclarations (normalized offline schema checks) and toolConfig.functionCallingConfig (AUTO/ANY/NONE), thought and thoughtSignature pass-through, generationConfig.thinkingConfig, responseMimeType (application/json) with responseSchema/responseJsonSchema, and unpriced user inlineData (image/* or application/pdf within 8 MiB; rejected with 400 on priced routes). Total input accounting combines promptTokenCount and toolUsePromptTokenCount; total output equals totalTokenCount minus total input. Missing terminal evidence or mid-stream interruptions retain holds and uncertainty.

Operation: `generateContent`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/v1beta/models/{model_action}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1beta/models/{model_action}" \
  -H "X-Niu-API-Key: $NIU_API_KEY" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### model_action

Location: **path**. **Required.**

```json
{
  "type": "string",
  "example": "fast:generateContent"
}
```

### alt

Location: **query**. Optional. Use alt=sse with :streamGenerateContent to receive text/event-stream instead of a JSON array stream. Unsupported on :generateContent.

```json
{
  "type": "string",
  "enum": [
    "sse"
  ]
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
    "contents"
  ],
  "properties": {
    "contents": {
      "type": "array",
      "minItems": 1,
      "maxItems": 256,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "parts"
        ],
        "properties": {
          "role": {
            "type": "string",
            "enum": [
              "user",
              "model"
            ]
          },
          "parts": {
            "type": "array",
            "minItems": 1,
            "maxItems": 128,
            "items": {
              "type": "object"
            }
          }
        }
      }
    },
    "systemInstruction": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "parts"
      ],
      "properties": {
        "role": {
          "type": "string",
          "enum": [
            "user",
            "system"
          ]
        },
        "parts": {
          "type": "array",
          "minItems": 1,
          "maxItems": 128,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "text"
            ],
            "properties": {
              "text": {
                "type": "string"
              }
            }
          }
        }
      }
    },
    "tools": {
      "type": "array",
      "minItems": 1,
      "maxItems": 16,
      "items": {
        "type": "object"
      }
    },
    "toolConfig": {
      "type": "object"
    },
    "generationConfig": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "maxOutputTokens": {
          "type": "integer",
          "minimum": 1,
          "maximum": 1000000
        },
        "candidateCount": {
          "type": "integer",
          "enum": [
            1
          ]
        },
        "temperature": {
          "type": "number",
          "minimum": 0,
          "maximum": 2
        },
        "topP": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "topK": {
          "type": "integer",
          "minimum": 1,
          "maximum": 10000
        },
        "seed": {
          "type": "integer"
        },
        "presencePenalty": {
          "type": "number",
          "minimum": -2,
          "maximum": 2
        },
        "frequencyPenalty": {
          "type": "number",
          "minimum": -2,
          "maximum": 2
        },
        "stopSequences": {
          "type": "array",
          "maxItems": 5,
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 512
          }
        },
        "thinkingConfig": {
          "type": "object"
        },
        "responseMimeType": {
          "type": "string",
          "enum": [
            "text/plain",
            "application/json"
          ]
        },
        "responseSchema": {
          "type": "object"
        },
        "responseJsonSchema": {
          "type": "object"
        }
      }
    }
  }
}
```

## Responses

### HTTP 200

Projected native text result. Reported usage does not prove a settled charge.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "candidates",
    "usageMetadata",
    "modelVersion"
  ],
  "properties": {
    "modelVersion": {
      "type": "string",
      "description": "Niu public model alias, not an upstream version guarantee."
    },
    "responseId": {
      "type": "string"
    },
    "candidates": {
      "type": "array",
      "minItems": 1,
      "maxItems": 1,
      "items": {
        "type": "object",
        "required": [
          "index",
          "content",
          "finishReason"
        ],
        "properties": {
          "index": {
            "type": "integer",
            "enum": [
              0
            ]
          },
          "content": {
            "type": "object",
            "required": [
              "role",
              "parts"
            ],
            "properties": {
              "role": {
                "type": "string",
                "enum": [
                  "model"
                ]
              },
              "parts": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "finishReason": {
            "type": "string",
            "enum": [
              "STOP",
              "MAX_TOKENS",
              "SAFETY",
              "RECITATION",
              "BLOCKLIST",
              "PROHIBITED_CONTENT",
              "SPII"
            ]
          }
        }
      }
    },
    "usageMetadata": {
      "type": "object",
      "properties": {
        "promptTokenCount": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 0
        },
        "toolUsePromptTokenCount": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 0
        },
        "candidatesTokenCount": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 0
        },
        "totalTokenCount": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 0
        },
        "cachedContentTokenCount": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 0
        },
        "thoughtsTokenCount": {
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
  "type": "string"
}
```

### HTTP 400

Invalid or unsupported text document

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "error"
  ],
  "properties": {
    "error": {
      "type": "object",
      "required": [
        "code",
        "status",
        "message"
      ],
      "properties": {
        "code": {
          "type": "integer"
        },
        "status": {
          "type": "string"
        },
        "message": {
          "type": "string"
        }
      }
    }
  }
}
```

### HTTP 401

Niu authentication required

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "error"
  ],
  "properties": {
    "error": {
      "type": "object",
      "required": [
        "code",
        "status",
        "message"
      ],
      "properties": {
        "code": {
          "type": "integer"
        },
        "status": {
          "type": "string"
        },
        "message": {
          "type": "string"
        }
      }
    }
  }
}
```

### HTTP 402

Insufficient capacity

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "error"
  ],
  "properties": {
    "error": {
      "type": "object",
      "required": [
        "code",
        "status",
        "message"
      ],
      "properties": {
        "code": {
          "type": "integer"
        },
        "status": {
          "type": "string"
        },
        "message": {
          "type": "string"
        }
      }
    }
  }
}
```

### HTTP 403

Scope or policy denial

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "error"
  ],
  "properties": {
    "error": {
      "type": "object",
      "required": [
        "code",
        "status",
        "message"
      ],
      "properties": {
        "code": {
          "type": "integer"
        },
        "status": {
          "type": "string"
        },
        "message": {
          "type": "string"
        }
      }
    }
  }
}
```

### HTTP 404

Unavailable model

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "error"
  ],
  "properties": {
    "error": {
      "type": "object",
      "required": [
        "code",
        "status",
        "message"
      ],
      "properties": {
        "code": {
          "type": "integer"
        },
        "status": {
          "type": "string"
        },
        "message": {
          "type": "string"
        }
      }
    }
  }
}
```

### HTTP 413

Body exceeds 1 MiB

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "error"
  ],
  "properties": {
    "error": {
      "type": "object",
      "required": [
        "code",
        "status",
        "message"
      ],
      "properties": {
        "code": {
          "type": "integer"
        },
        "status": {
          "type": "string"
        },
        "message": {
          "type": "string"
        }
      }
    }
  }
}
```

### HTTP 422

Unsupported configured token category pricing

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "error"
  ],
  "properties": {
    "error": {
      "type": "object",
      "required": [
        "code",
        "status",
        "message"
      ],
      "properties": {
        "code": {
          "type": "integer"
        },
        "status": {
          "type": "string"
        },
        "message": {
          "type": "string"
        }
      }
    }
  }
}
```

### HTTP 429

Key or workspace limit

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "error"
  ],
  "properties": {
    "error": {
      "type": "object",
      "required": [
        "code",
        "status",
        "message"
      ],
      "properties": {
        "code": {
          "type": "integer"
        },
        "status": {
          "type": "string"
        },
        "message": {
          "type": "string"
        }
      }
    }
  }
}
```

### HTTP 501

Unsupported action or undeclared native route

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "error"
  ],
  "properties": {
    "error": {
      "type": "object",
      "required": [
        "code",
        "status",
        "message"
      ],
      "properties": {
        "code": {
          "type": "integer"
        },
        "status": {
          "type": "string"
        },
        "message": {
          "type": "string"
        }
      }
    }
  }
}
```

### HTTP 502

Sanitized upstream or output failure

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "error"
  ],
  "properties": {
    "error": {
      "type": "object",
      "required": [
        "code",
        "status",
        "message"
      ],
      "properties": {
        "code": {
          "type": "integer"
        },
        "status": {
          "type": "string"
        },
        "message": {
          "type": "string"
        }
      }
    }
  }
}
```

### HTTP 503

Unavailable service

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "error"
  ],
  "properties": {
    "error": {
      "type": "object",
      "required": [
        "code",
        "status",
        "message"
      ],
      "properties": {
        "code": {
          "type": "integer"
        },
        "status": {
          "type": "string"
        },
        "message": {
          "type": "string"
        }
      }
    }
  }
}
```

## Behavior and supported scope

Requires provider gemini with supports_generate_content enabled; streaming additionally requires supports_generate_content_streaming. model_action accepts {model}:generateContent or {model}:streamGenerateContent (URL-encode slashes inside aliases). Streaming returns JSON array chunks by default or SSE when ?alt=sse is supplied; query ?key= is rejected (use Authorization: Bearer or x-niu-api-key). Supports client functionDeclarations (normalized offline schema checks) and toolConfig.functionCallingConfig (AUTO/ANY/NONE), thought and thoughtSignature pass-through, generationConfig.thinkingConfig, responseMimeType (application/json) with responseSchema/responseJsonSchema, and unpriced user inlineData (image/* or application/pdf within 8 MiB; rejected with 400 on priced routes). Total input accounting combines promptTokenCount and toolUsePromptTokenCount; total output equals totalTokenCount minus total input. Missing terminal evidence or mid-stream interruptions retain holds and uncertainty.

**Supported scope:** implemented

**Supported scope:** Static or managed gemini routes supporting buffered :generateContent and streaming :streamGenerateContent (?alt=sse SSE or JSON array stream), client functionDeclarations/toolConfig, thinkingConfig, responseMimeType/responseSchema, and unpriced inlineData.
