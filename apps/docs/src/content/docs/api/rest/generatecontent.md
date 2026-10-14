---
title: "Generate native buffered Gemini text"
description: "POST /v1beta/models/{model_action}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1beta/models/{model_action}`

Set provider gemini and supports_generate_content true on a static route, or create a managed gemini credential and opt its model mapping into supports_generate_content. model_action is the URL-encoded public alias followed by :generateContent; encode slashes inside aliases. Niu bearer or x-niu-api-key authentication is required. Only bounded nonstreaming text with generationConfig.maxOutputTokens is supported; tools, media, cachedContent, thinking configuration and other actions are rejected before dispatch. Uses shared grants, key limits, prepaid reservations, guardrails, diagnostics and settlement; no Chat translation or automatic retry. Total output is totalTokenCount minus promptTokenCount, which includes reported thoughts under the native contract. Missing category counts remain unknown; cache-write rates are unsupported and rejected before dispatch. Unknown aggregate usage retains priced liabilities. Client response fields are projected; modelVersion uses the public alias and thought signatures are not exposed. Native SDK compatibility and successful end-to-end billing remain unverified as documented.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1beta/models/{model_action}" \
  -H "Authorization: Bearer $NIU_API_KEY" \
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "contents",
    "generationConfig"
  ],
  "properties": {
    "contents": {
      "type": "array",
      "minItems": 1,
      "maxItems": 128,
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
            "model",
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
    "generationConfig": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "maxOutputTokens"
      ],
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
        "stopSequences": {
          "type": "array",
          "maxItems": 5,
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 512
          }
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
          "finishReason": {
            "type": "string",
            "enum": [
              "STOP",
              "MAX_TOKENS"
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

Set provider gemini and supports_generate_content true on a static route, or create a managed gemini credential and opt its model mapping into supports_generate_content. model_action is the URL-encoded public alias followed by :generateContent; encode slashes inside aliases. Niu bearer or x-niu-api-key authentication is required. Only bounded nonstreaming text with generationConfig.maxOutputTokens is supported; tools, media, cachedContent, thinking configuration and other actions are rejected before dispatch. Uses shared grants, key limits, prepaid reservations, guardrails, diagnostics and settlement; no Chat translation or automatic retry. Total output is totalTokenCount minus promptTokenCount, which includes reported thoughts under the native contract. Missing category counts remain unknown; cache-write rates are unsupported and rejected before dispatch. Unknown aggregate usage retains priced liabilities. Client response fields are projected; modelVersion uses the public alias and thought signatures are not exposed. Native SDK compatibility and successful end-to-end billing remain unverified as documented.

**Supported scope:** implemented

**Supported scope:** Static or managed gemini routes only; successful native upstream completion remains unverified.
