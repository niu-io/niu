---
title: "Create or update a model mapping with optimistic revision checks"
description: "POST /api/v1/vendors/{id}/models"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/vendors/{id}/models`

Omit expected_revision to create; provide the current revision to update. Aliases cannot be reassigned to another vendor. Disabled mappings still override static file aliases. Requires installation administration or an explicitly granted platform administrator. These platform-only route prices are procurement configuration, not customer selling tariffs. Omit pricing to preserve it on update; explicit null clears it. Changes do not rewrite previously pinned request prices.

Operation: `upsertVendorModel`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/vendors/{id}/models" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### id

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
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
    "alias",
    "upstream_model"
  ],
  "properties": {
    "alias": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200,
      "pattern": "^[A-Za-z0-9._/-]+$"
    },
    "upstream_model": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "enabled": {
      "type": "boolean",
      "default": true
    },
    "public_catalog": {
      "type": "boolean",
      "default": false
    },
    "capabilities": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "catalog": {
          "type": "object",
          "additionalProperties": false,
          "description": "Descriptive provider metadata, stored under capabilities.catalog on vendor mappings and exposed as catalog on model listings. Advertised USD per-token prices are separate from billing rates. Missing values mean unknown, never zero.",
          "properties": {
            "name": {
              "type": [
                "string",
                "null"
              ],
              "maxLength": 300
            },
            "description": {
              "type": [
                "string",
                "null"
              ],
              "maxLength": 12000
            },
            "context_length": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 1
            },
            "max_completion_tokens": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 1
            },
            "input_modalities": {
              "type": "array",
              "maxItems": 16,
              "items": {
                "type": "string",
                "maxLength": 40
              }
            },
            "output_modalities": {
              "type": "array",
              "maxItems": 16,
              "items": {
                "type": "string",
                "maxLength": 40
              }
            },
            "supported_parameters": {
              "type": "array",
              "maxItems": 64,
              "items": {
                "type": "string",
                "minLength": 1,
                "maxLength": 80
              }
            },
            "input_price": {
              "type": [
                "string",
                "null"
              ],
              "maxLength": 64,
              "description": "Advertised USD per input token."
            },
            "output_price": {
              "type": [
                "string",
                "null"
              ],
              "maxLength": 64,
              "description": "Advertised USD per output token."
            }
          }
        },
        "video_schema": {
          "type": "object",
          "additionalProperties": false,
          "description": "Versioned constraints for the exact alias/upstream model/channel. The enclosing capabilities document is limited to 16 KiB. Backend validation enforces relative bounds, defaults, input transport, roles and incompatible controls. Configuration does not qualify a route or enable unsupported media/callback transport.",
          "required": [
            "version",
            "revision",
            "model_alias",
            "upstream_model",
            "channel",
            "maximum_body_bytes",
            "maximum_content_items",
            "inputs",
            "controls",
            "required_controls",
            "exclusive_controls",
            "callbacks_qualified"
          ],
          "properties": {
            "version": {
              "type": "integer",
              "const": 1
            },
            "revision": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256,
              "description": "Trimmed canonical revision with no control characters; at most 256 UTF-8 bytes."
            },
            "model_alias": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200,
              "description": "Must match the enclosing model alias."
            },
            "upstream_model": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200,
              "description": "Must match the enclosing upstream mapping."
            },
            "channel": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256,
              "description": "Exact canonical channel contract; at most 256 UTF-8 bytes."
            },
            "maximum_body_bytes": {
              "type": "integer",
              "minimum": 1,
              "maximum": 16777216
            },
            "maximum_content_items": {
              "type": "integer",
              "minimum": 1,
              "maximum": 32
            },
            "inputs": {
              "type": "object",
              "additionalProperties": false,
              "minProperties": 1,
              "properties": {
                "text": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "maximum_items",
                    "maximum_bytes",
                    "https",
                    "data_mime_types",
                    "roles",
                    "role_required"
                  ],
                  "description": "Item/count bounds cannot exceed the enclosing request limits. Non-text inputs require HTTPS or at least one allowed Base64 MIME type; required roles need at least one allowed role. Names are trimmed, control-free and limited to 256 UTF-8 bytes.",
                  "properties": {
                    "maximum_items": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 32
                    },
                    "maximum_bytes": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 16777216
                    },
                    "https": {
                      "type": "boolean"
                    },
                    "data_mime_types": {
                      "type": "array",
                      "maxItems": 16,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256,
                        "pattern": "/"
                      }
                    },
                    "roles": {
                      "type": "array",
                      "maxItems": 16,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
                      }
                    },
                    "role_required": {
                      "type": "boolean"
                    }
                  }
                },
                "image_url": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "maximum_items",
                    "maximum_bytes",
                    "https",
                    "data_mime_types",
                    "roles",
                    "role_required"
                  ],
                  "description": "Item/count bounds cannot exceed the enclosing request limits. Non-text inputs require HTTPS or at least one allowed Base64 MIME type; required roles need at least one allowed role. Names are trimmed, control-free and limited to 256 UTF-8 bytes.",
                  "properties": {
                    "maximum_items": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 32
                    },
                    "maximum_bytes": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 16777216
                    },
                    "https": {
                      "type": "boolean"
                    },
                    "data_mime_types": {
                      "type": "array",
                      "maxItems": 16,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256,
                        "pattern": "/"
                      }
                    },
                    "roles": {
                      "type": "array",
                      "maxItems": 16,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
                      }
                    },
                    "role_required": {
                      "type": "boolean"
                    }
                  }
                },
                "video_url": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "maximum_items",
                    "maximum_bytes",
                    "https",
                    "data_mime_types",
                    "roles",
                    "role_required"
                  ],
                  "description": "Item/count bounds cannot exceed the enclosing request limits. Non-text inputs require HTTPS or at least one allowed Base64 MIME type; required roles need at least one allowed role. Names are trimmed, control-free and limited to 256 UTF-8 bytes.",
                  "properties": {
                    "maximum_items": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 32
                    },
                    "maximum_bytes": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 16777216
                    },
                    "https": {
                      "type": "boolean"
                    },
                    "data_mime_types": {
                      "type": "array",
                      "maxItems": 16,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256,
                        "pattern": "/"
                      }
                    },
                    "roles": {
                      "type": "array",
                      "maxItems": 16,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
                      }
                    },
                    "role_required": {
                      "type": "boolean"
                    }
                  }
                },
                "audio_url": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "maximum_items",
                    "maximum_bytes",
                    "https",
                    "data_mime_types",
                    "roles",
                    "role_required"
                  ],
                  "description": "Item/count bounds cannot exceed the enclosing request limits. Non-text inputs require HTTPS or at least one allowed Base64 MIME type; required roles need at least one allowed role. Names are trimmed, control-free and limited to 256 UTF-8 bytes.",
                  "properties": {
                    "maximum_items": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 32
                    },
                    "maximum_bytes": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 16777216
                    },
                    "https": {
                      "type": "boolean"
                    },
                    "data_mime_types": {
                      "type": "array",
                      "maxItems": 16,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256,
                        "pattern": "/"
                      }
                    },
                    "roles": {
                      "type": "array",
                      "maxItems": 16,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
                      }
                    },
                    "role_required": {
                      "type": "boolean"
                    }
                  }
                }
              }
            },
            "controls": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "duration": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "kind",
                    "minimum",
                    "maximum"
                  ],
                  "description": "Signed 64-bit integer bounds; maximum must be at least minimum and any default must lie within them. The dashboard edits exact JavaScript-safe integers only.",
                  "properties": {
                    "kind": {
                      "type": "string",
                      "const": "integer"
                    },
                    "minimum": {
                      "type": "integer",
                      "format": "int64"
                    },
                    "maximum": {
                      "type": "integer",
                      "format": "int64"
                    },
                    "default": {
                      "type": [
                        "integer",
                        "null"
                      ],
                      "format": "int64"
                    }
                  }
                },
                "seed": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "kind",
                    "minimum",
                    "maximum"
                  ],
                  "description": "Signed 64-bit integer bounds; maximum must be at least minimum and any default must lie within them. The dashboard edits exact JavaScript-safe integers only.",
                  "properties": {
                    "kind": {
                      "type": "string",
                      "const": "integer"
                    },
                    "minimum": {
                      "type": "integer",
                      "format": "int64"
                    },
                    "maximum": {
                      "type": "integer",
                      "format": "int64"
                    },
                    "default": {
                      "type": [
                        "integer",
                        "null"
                      ],
                      "format": "int64"
                    }
                  }
                },
                "frames_per_second": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "kind",
                    "minimum",
                    "maximum"
                  ],
                  "description": "Signed 64-bit integer bounds; maximum must be at least minimum and any default must lie within them. The dashboard edits exact JavaScript-safe integers only.",
                  "properties": {
                    "kind": {
                      "type": "string",
                      "const": "integer"
                    },
                    "minimum": {
                      "type": "integer",
                      "format": "int64"
                    },
                    "maximum": {
                      "type": "integer",
                      "format": "int64"
                    },
                    "default": {
                      "type": [
                        "integer",
                        "null"
                      ],
                      "format": "int64"
                    }
                  }
                },
                "resolution": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "kind",
                    "values"
                  ],
                  "description": "Values are canonical names of at most 256 UTF-8 bytes; any default must be one of them.",
                  "properties": {
                    "kind": {
                      "type": "string",
                      "const": "choice"
                    },
                    "values": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 64,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
                      }
                    },
                    "default": {
                      "type": [
                        "string",
                        "null"
                      ]
                    }
                  }
                },
                "ratio": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "kind",
                    "values"
                  ],
                  "description": "Values are canonical names of at most 256 UTF-8 bytes; any default must be one of them.",
                  "properties": {
                    "kind": {
                      "type": "string",
                      "const": "choice"
                    },
                    "values": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 64,
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
                      }
                    },
                    "default": {
                      "type": [
                        "string",
                        "null"
                      ]
                    }
                  }
                },
                "watermark": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "kind"
                  ],
                  "properties": {
                    "kind": {
                      "type": "string",
                      "const": "boolean"
                    },
                    "default": {
                      "type": [
                        "boolean",
                        "null"
                      ]
                    }
                  }
                },
                "camera_fixed": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "kind"
                  ],
                  "properties": {
                    "kind": {
                      "type": "string",
                      "const": "boolean"
                    },
                    "default": {
                      "type": [
                        "boolean",
                        "null"
                      ]
                    }
                  }
                },
                "return_last_frame": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "kind"
                  ],
                  "properties": {
                    "kind": {
                      "type": "string",
                      "const": "boolean"
                    },
                    "default": {
                      "type": [
                        "boolean",
                        "null"
                      ]
                    }
                  }
                },
                "callback_url": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "kind",
                    "maximum_bytes"
                  ],
                  "properties": {
                    "kind": {
                      "type": "string",
                      "const": "https_url"
                    },
                    "maximum_bytes": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 8192
                    }
                  }
                }
              }
            },
            "required_controls": {
              "type": "array",
              "maxItems": 9,
              "uniqueItems": true,
              "description": "Every named control must be configured.",
              "items": {
                "type": "string",
                "enum": [
                  "duration",
                  "resolution",
                  "ratio",
                  "seed",
                  "watermark",
                  "camera_fixed",
                  "return_last_frame",
                  "frames_per_second",
                  "callback_url"
                ]
              }
            },
            "exclusive_controls": {
              "type": "array",
              "maxItems": 32,
              "description": "Each pair names distinct configured controls; both cannot have defaults.",
              "items": {
                "type": "array",
                "minItems": 2,
                "maxItems": 2,
                "uniqueItems": true,
                "items": {
                  "type": "string",
                  "enum": [
                    "duration",
                    "resolution",
                    "ratio",
                    "seed",
                    "watermark",
                    "camera_fixed",
                    "return_last_frame",
                    "frames_per_second",
                    "callback_url"
                  ]
                }
              }
            },
            "output": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "specifications",
                "estimator",
                "estimator_revision"
              ],
              "description": "Optional effective output mapping for this schema revision. Requires resolution, ratio and positive duration controls, each with a default or required input. Pixel estimation additionally requires a positive frames_per_second control; seconds estimation may omit it. Missing resolution/ratio combinations reject requests before dispatch. Estimates never establish reported usage or maximum liability. The ark-direct-v1 adapter qualifies video_tokens only; openrouter-video-v1 supports owner-funded text generation with seconds estimates and unknown reported quantity.",
              "properties": {
                "estimator": {
                  "type": "string",
                  "enum": [
                    "SeedancePixelsV1",
                    "OutputSecondsV1"
                  ]
                },
                "estimator_revision": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 256,
                  "description": "Reviewed configuration reference; at most 256 UTF-8 bytes."
                },
                "specifications": {
                  "type": "array",
                  "minItems": 1,
                  "maxItems": 256,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "resolution",
                      "ratio",
                      "width",
                      "height"
                    ],
                    "properties": {
                      "resolution": {
                        "type": "string",
                        "description": "Must be accepted by the configured resolution control."
                      },
                      "ratio": {
                        "type": "string",
                        "description": "Must be accepted by the configured ratio control; each resolution/ratio pair is unique."
                      },
                      "width": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 4294967295
                      },
                      "height": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 4294967295
                      }
                    }
                  }
                }
              }
            },
            "callbacks_qualified": {
              "type": "boolean",
              "description": "Required for a callback_url declaration; separate adapter/offer qualification and callback authentication still apply."
            }
          }
        },
        "provider_assets": {
          "description": "Explicit FastRouter asset protocol on an Ark adapter; not processing readiness or commercial qualification.",
          "oneOf": [
            {
              "type": "null"
            },
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "channel"
              ],
              "properties": {
                "channel": {
                  "type": "string",
                  "const": "fastrouter-actions-v1"
                }
              }
            }
          ]
        },
        "supports_tool_calls": {
          "type": "boolean",
          "default": false
        },
        "supports_streaming_tool_calls": {
          "type": "boolean",
          "default": false
        },
        "supports_structured_output": {
          "type": "boolean",
          "default": false
        },
        "supports_embeddings": {
          "type": "boolean",
          "default": false
        },
        "supports_embedding_dimensions": {
          "type": "boolean",
          "default": false
        },
        "supports_embedding_base64": {
          "type": "boolean",
          "default": false
        },
        "supports_generate_content": {
          "type": "boolean",
          "default": false,
          "description": "Native GenerateContent opt-in for static or managed gemini routes; does not imply streaming, tools or media support."
        },
        "supports_messages_streaming_tools": {
          "type": "boolean",
          "default": false,
          "description": "Explicit native client-tool SSE capability; requires supports_messages_tools and supports_messages_streaming. JSON arguments are bounded and validated at block completion."
        },
        "supports_messages_tools": {
          "type": "boolean",
          "default": false,
          "description": "Explicit buffered native client-tool capability; requires supports_messages. Streaming tools require the separate supports_messages_streaming_tools capability."
        },
        "supports_messages_streaming": {
          "type": "boolean",
          "default": false,
          "description": "Explicit native text SSE opt-in; requires supports_messages."
        },
        "supports_messages": {
          "type": "boolean",
          "default": false,
          "description": "Explicit native Messages nonstreaming text capability for OpenRouter or Anthropic routes. Does not imply streaming, tools or media support."
        },
        "supports_responses": {
          "type": "boolean",
          "default": false
        }
      }
    },
    "pricing": {
      "type": [
        "object",
        "null"
      ],
      "additionalProperties": false,
      "required": [
        "currency",
        "api_prompt_rate",
        "api_completion_rate",
        "cash_prompt_rate",
        "cash_completion_rate",
        "max_input_tokens",
        "max_output_tokens"
      ],
      "properties": {
        "currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$"
        },
        "api_prompt_rate": {
          "type": "integer",
          "format": "int64",
          "minimum": 0,
          "description": "Currency nanounits per million tokens. JSON integer, not a decimal string. Platform procurement metadata only."
        },
        "api_completion_rate": {
          "type": "integer",
          "format": "int64",
          "minimum": 0,
          "description": "Currency nanounits per million tokens. JSON integer, not a decimal string. Platform procurement metadata only."
        },
        "cash_prompt_rate": {
          "type": "integer",
          "format": "int64",
          "minimum": 0,
          "description": "Currency nanounits per million tokens. JSON integer, not a decimal string. Platform procurement metadata only."
        },
        "cash_completion_rate": {
          "type": "integer",
          "format": "int64",
          "minimum": 0,
          "description": "Currency nanounits per million tokens. JSON integer, not a decimal string. Platform procurement metadata only."
        },
        "max_input_tokens": {
          "type": "integer",
          "format": "int64",
          "minimum": 1,
          "description": "Operator-attested provider token bound used for pre-dispatch liability admission; not an estimated token count."
        },
        "max_output_tokens": {
          "type": "integer",
          "format": "int64",
          "minimum": 1,
          "description": "Operator-attested provider token bound used for pre-dispatch liability admission; not an estimated token count."
        }
      },
      "description": "Confidential route procurement configuration, separate from customer selling tariffs. All fields are required when non-null. Combined charges at the configured bounds must fit a signed 64-bit nanounit amount; invalid or overflowing configurations are rejected. Personal-owned credentials require null pricing."
    },
    "expected_revision": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": 1
    }
  }
}
```

## Responses

### HTTP 200

Persisted model mapping wrapped in data.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "required": [
        "alias",
        "vendor_id",
        "upstream_model",
        "enabled",
        "public_catalog",
        "capabilities",
        "pricing",
        "revision"
      ],
      "properties": {
        "alias": {
          "type": "string"
        },
        "vendor_id": {
          "type": "string",
          "format": "uuid"
        },
        "upstream_model": {
          "type": "string"
        },
        "enabled": {
          "type": "boolean"
        },
        "public_catalog": {
          "type": "boolean"
        },
        "available": {
          "type": "boolean",
          "readOnly": true,
          "description": "Configuration eligibility in the management list; not an upstream health or entitlement check."
        },
        "owner_funded": {
          "type": "boolean",
          "readOnly": true,
          "description": "Management-list metadata identifying private owner-funded routes. Omitted from configuration writes."
        },
        "capabilities": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "catalog": {
              "type": "object",
              "additionalProperties": false,
              "description": "Descriptive provider metadata, stored under capabilities.catalog on vendor mappings and exposed as catalog on model listings. Advertised USD per-token prices are separate from billing rates. Missing values mean unknown, never zero.",
              "properties": {
                "name": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "maxLength": 300
                },
                "description": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "maxLength": 12000
                },
                "context_length": {
                  "type": [
                    "integer",
                    "null"
                  ],
                  "minimum": 1
                },
                "max_completion_tokens": {
                  "type": [
                    "integer",
                    "null"
                  ],
                  "minimum": 1
                },
                "input_modalities": {
                  "type": "array",
                  "maxItems": 16,
                  "items": {
                    "type": "string",
                    "maxLength": 40
                  }
                },
                "output_modalities": {
                  "type": "array",
                  "maxItems": 16,
                  "items": {
                    "type": "string",
                    "maxLength": 40
                  }
                },
                "supported_parameters": {
                  "type": "array",
                  "maxItems": 64,
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 80
                  }
                },
                "input_price": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "maxLength": 64,
                  "description": "Advertised USD per input token."
                },
                "output_price": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "maxLength": 64,
                  "description": "Advertised USD per output token."
                }
              }
            },
            "video_schema": {
              "type": "object",
              "additionalProperties": false,
              "description": "Versioned constraints for the exact alias/upstream model/channel. The enclosing capabilities document is limited to 16 KiB. Backend validation enforces relative bounds, defaults, input transport, roles and incompatible controls. Configuration does not qualify a route or enable unsupported media/callback transport.",
              "required": [
                "version",
                "revision",
                "model_alias",
                "upstream_model",
                "channel",
                "maximum_body_bytes",
                "maximum_content_items",
                "inputs",
                "controls",
                "required_controls",
                "exclusive_controls",
                "callbacks_qualified"
              ],
              "properties": {
                "version": {
                  "type": "integer",
                  "const": 1
                },
                "revision": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 256,
                  "description": "Trimmed canonical revision with no control characters; at most 256 UTF-8 bytes."
                },
                "model_alias": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 200,
                  "description": "Must match the enclosing model alias."
                },
                "upstream_model": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 200,
                  "description": "Must match the enclosing upstream mapping."
                },
                "channel": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 256,
                  "description": "Exact canonical channel contract; at most 256 UTF-8 bytes."
                },
                "maximum_body_bytes": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 16777216
                },
                "maximum_content_items": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 32
                },
                "inputs": {
                  "type": "object",
                  "additionalProperties": false,
                  "minProperties": 1,
                  "properties": {
                    "text": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "maximum_items",
                        "maximum_bytes",
                        "https",
                        "data_mime_types",
                        "roles",
                        "role_required"
                      ],
                      "description": "Item/count bounds cannot exceed the enclosing request limits. Non-text inputs require HTTPS or at least one allowed Base64 MIME type; required roles need at least one allowed role. Names are trimmed, control-free and limited to 256 UTF-8 bytes.",
                      "properties": {
                        "maximum_items": {
                          "type": "integer",
                          "minimum": 1,
                          "maximum": 32
                        },
                        "maximum_bytes": {
                          "type": "integer",
                          "minimum": 1,
                          "maximum": 16777216
                        },
                        "https": {
                          "type": "boolean"
                        },
                        "data_mime_types": {
                          "type": "array",
                          "maxItems": 16,
                          "uniqueItems": true,
                          "items": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 256,
                            "pattern": "/"
                          }
                        },
                        "roles": {
                          "type": "array",
                          "maxItems": 16,
                          "uniqueItems": true,
                          "items": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 256
                          }
                        },
                        "role_required": {
                          "type": "boolean"
                        }
                      }
                    },
                    "image_url": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "maximum_items",
                        "maximum_bytes",
                        "https",
                        "data_mime_types",
                        "roles",
                        "role_required"
                      ],
                      "description": "Item/count bounds cannot exceed the enclosing request limits. Non-text inputs require HTTPS or at least one allowed Base64 MIME type; required roles need at least one allowed role. Names are trimmed, control-free and limited to 256 UTF-8 bytes.",
                      "properties": {
                        "maximum_items": {
                          "type": "integer",
                          "minimum": 1,
                          "maximum": 32
                        },
                        "maximum_bytes": {
                          "type": "integer",
                          "minimum": 1,
                          "maximum": 16777216
                        },
                        "https": {
                          "type": "boolean"
                        },
                        "data_mime_types": {
                          "type": "array",
                          "maxItems": 16,
                          "uniqueItems": true,
                          "items": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 256,
                            "pattern": "/"
                          }
                        },
                        "roles": {
                          "type": "array",
                          "maxItems": 16,
                          "uniqueItems": true,
                          "items": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 256
                          }
                        },
                        "role_required": {
                          "type": "boolean"
                        }
                      }
                    },
                    "video_url": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "maximum_items",
                        "maximum_bytes",
                        "https",
                        "data_mime_types",
                        "roles",
                        "role_required"
                      ],
                      "description": "Item/count bounds cannot exceed the enclosing request limits. Non-text inputs require HTTPS or at least one allowed Base64 MIME type; required roles need at least one allowed role. Names are trimmed, control-free and limited to 256 UTF-8 bytes.",
                      "properties": {
                        "maximum_items": {
                          "type": "integer",
                          "minimum": 1,
                          "maximum": 32
                        },
                        "maximum_bytes": {
                          "type": "integer",
                          "minimum": 1,
                          "maximum": 16777216
                        },
                        "https": {
                          "type": "boolean"
                        },
                        "data_mime_types": {
                          "type": "array",
                          "maxItems": 16,
                          "uniqueItems": true,
                          "items": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 256,
                            "pattern": "/"
                          }
                        },
                        "roles": {
                          "type": "array",
                          "maxItems": 16,
                          "uniqueItems": true,
                          "items": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 256
                          }
                        },
                        "role_required": {
                          "type": "boolean"
                        }
                      }
                    },
                    "audio_url": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "maximum_items",
                        "maximum_bytes",
                        "https",
                        "data_mime_types",
                        "roles",
                        "role_required"
                      ],
                      "description": "Item/count bounds cannot exceed the enclosing request limits. Non-text inputs require HTTPS or at least one allowed Base64 MIME type; required roles need at least one allowed role. Names are trimmed, control-free and limited to 256 UTF-8 bytes.",
                      "properties": {
                        "maximum_items": {
                          "type": "integer",
                          "minimum": 1,
                          "maximum": 32
                        },
                        "maximum_bytes": {
                          "type": "integer",
                          "minimum": 1,
                          "maximum": 16777216
                        },
                        "https": {
                          "type": "boolean"
                        },
                        "data_mime_types": {
                          "type": "array",
                          "maxItems": 16,
                          "uniqueItems": true,
                          "items": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 256,
                            "pattern": "/"
                          }
                        },
                        "roles": {
                          "type": "array",
                          "maxItems": 16,
                          "uniqueItems": true,
                          "items": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 256
                          }
                        },
                        "role_required": {
                          "type": "boolean"
                        }
                      }
                    }
                  }
                },
                "controls": {
                  "type": "object",
                  "additionalProperties": false,
                  "properties": {
                    "duration": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "kind",
                        "minimum",
                        "maximum"
                      ],
                      "description": "Signed 64-bit integer bounds; maximum must be at least minimum and any default must lie within them. The dashboard edits exact JavaScript-safe integers only.",
                      "properties": {
                        "kind": {
                          "type": "string",
                          "const": "integer"
                        },
                        "minimum": {
                          "type": "integer",
                          "format": "int64"
                        },
                        "maximum": {
                          "type": "integer",
                          "format": "int64"
                        },
                        "default": {
                          "type": [
                            "integer",
                            "null"
                          ],
                          "format": "int64"
                        }
                      }
                    },
                    "seed": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "kind",
                        "minimum",
                        "maximum"
                      ],
                      "description": "Signed 64-bit integer bounds; maximum must be at least minimum and any default must lie within them. The dashboard edits exact JavaScript-safe integers only.",
                      "properties": {
                        "kind": {
                          "type": "string",
                          "const": "integer"
                        },
                        "minimum": {
                          "type": "integer",
                          "format": "int64"
                        },
                        "maximum": {
                          "type": "integer",
                          "format": "int64"
                        },
                        "default": {
                          "type": [
                            "integer",
                            "null"
                          ],
                          "format": "int64"
                        }
                      }
                    },
                    "frames_per_second": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "kind",
                        "minimum",
                        "maximum"
                      ],
                      "description": "Signed 64-bit integer bounds; maximum must be at least minimum and any default must lie within them. The dashboard edits exact JavaScript-safe integers only.",
                      "properties": {
                        "kind": {
                          "type": "string",
                          "const": "integer"
                        },
                        "minimum": {
                          "type": "integer",
                          "format": "int64"
                        },
                        "maximum": {
                          "type": "integer",
                          "format": "int64"
                        },
                        "default": {
                          "type": [
                            "integer",
                            "null"
                          ],
                          "format": "int64"
                        }
                      }
                    },
                    "resolution": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "kind",
                        "values"
                      ],
                      "description": "Values are canonical names of at most 256 UTF-8 bytes; any default must be one of them.",
                      "properties": {
                        "kind": {
                          "type": "string",
                          "const": "choice"
                        },
                        "values": {
                          "type": "array",
                          "minItems": 1,
                          "maxItems": 64,
                          "uniqueItems": true,
                          "items": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 256
                          }
                        },
                        "default": {
                          "type": [
                            "string",
                            "null"
                          ]
                        }
                      }
                    },
                    "ratio": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "kind",
                        "values"
                      ],
                      "description": "Values are canonical names of at most 256 UTF-8 bytes; any default must be one of them.",
                      "properties": {
                        "kind": {
                          "type": "string",
                          "const": "choice"
                        },
                        "values": {
                          "type": "array",
                          "minItems": 1,
                          "maxItems": 64,
                          "uniqueItems": true,
                          "items": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 256
                          }
                        },
                        "default": {
                          "type": [
                            "string",
                            "null"
                          ]
                        }
                      }
                    },
                    "watermark": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "kind"
                      ],
                      "properties": {
                        "kind": {
                          "type": "string",
                          "const": "boolean"
                        },
                        "default": {
                          "type": [
                            "boolean",
                            "null"
                          ]
                        }
                      }
                    },
                    "camera_fixed": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "kind"
                      ],
                      "properties": {
                        "kind": {
                          "type": "string",
                          "const": "boolean"
                        },
                        "default": {
                          "type": [
                            "boolean",
                            "null"
                          ]
                        }
                      }
                    },
                    "return_last_frame": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "kind"
                      ],
                      "properties": {
                        "kind": {
                          "type": "string",
                          "const": "boolean"
                        },
                        "default": {
                          "type": [
                            "boolean",
                            "null"
                          ]
                        }
                      }
                    },
                    "callback_url": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "kind",
                        "maximum_bytes"
                      ],
                      "properties": {
                        "kind": {
                          "type": "string",
                          "const": "https_url"
                        },
                        "maximum_bytes": {
                          "type": "integer",
                          "minimum": 1,
                          "maximum": 8192
                        }
                      }
                    }
                  }
                },
                "required_controls": {
                  "type": "array",
                  "maxItems": 9,
                  "uniqueItems": true,
                  "description": "Every named control must be configured.",
                  "items": {
                    "type": "string",
                    "enum": [
                      "duration",
                      "resolution",
                      "ratio",
                      "seed",
                      "watermark",
                      "camera_fixed",
                      "return_last_frame",
                      "frames_per_second",
                      "callback_url"
                    ]
                  }
                },
                "exclusive_controls": {
                  "type": "array",
                  "maxItems": 32,
                  "description": "Each pair names distinct configured controls; both cannot have defaults.",
                  "items": {
                    "type": "array",
                    "minItems": 2,
                    "maxItems": 2,
                    "uniqueItems": true,
                    "items": {
                      "type": "string",
                      "enum": [
                        "duration",
                        "resolution",
                        "ratio",
                        "seed",
                        "watermark",
                        "camera_fixed",
                        "return_last_frame",
                        "frames_per_second",
                        "callback_url"
                      ]
                    }
                  }
                },
                "output": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "specifications",
                    "estimator",
                    "estimator_revision"
                  ],
                  "description": "Optional effective output mapping for this schema revision. Requires resolution, ratio and positive duration controls, each with a default or required input. Pixel estimation additionally requires a positive frames_per_second control; seconds estimation may omit it. Missing resolution/ratio combinations reject requests before dispatch. Estimates never establish reported usage or maximum liability. The ark-direct-v1 adapter qualifies video_tokens only; openrouter-video-v1 supports owner-funded text generation with seconds estimates and unknown reported quantity.",
                  "properties": {
                    "estimator": {
                      "type": "string",
                      "enum": [
                        "SeedancePixelsV1",
                        "OutputSecondsV1"
                      ]
                    },
                    "estimator_revision": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 256,
                      "description": "Reviewed configuration reference; at most 256 UTF-8 bytes."
                    },
                    "specifications": {
                      "type": "array",
                      "minItems": 1,
                      "maxItems": 256,
                      "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                          "resolution",
                          "ratio",
                          "width",
                          "height"
                        ],
                        "properties": {
                          "resolution": {
                            "type": "string",
                            "description": "Must be accepted by the configured resolution control."
                          },
                          "ratio": {
                            "type": "string",
                            "description": "Must be accepted by the configured ratio control; each resolution/ratio pair is unique."
                          },
                          "width": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 4294967295
                          },
                          "height": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 4294967295
                          }
                        }
                      }
                    }
                  }
                },
                "callbacks_qualified": {
                  "type": "boolean",
                  "description": "Required for a callback_url declaration; separate adapter/offer qualification and callback authentication still apply."
                }
              }
            },
            "provider_assets": {
              "description": "Explicit FastRouter asset protocol on an Ark adapter; not processing readiness or commercial qualification.",
              "oneOf": [
                {
                  "type": "null"
                },
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "channel"
                  ],
                  "properties": {
                    "channel": {
                      "type": "string",
                      "const": "fastrouter-actions-v1"
                    }
                  }
                }
              ]
            },
            "supports_tool_calls": {
              "type": "boolean",
              "default": false
            },
            "supports_streaming_tool_calls": {
              "type": "boolean",
              "default": false
            },
            "supports_structured_output": {
              "type": "boolean",
              "default": false
            },
            "supports_embeddings": {
              "type": "boolean",
              "default": false
            },
            "supports_embedding_dimensions": {
              "type": "boolean",
              "default": false
            },
            "supports_embedding_base64": {
              "type": "boolean",
              "default": false
            },
            "supports_generate_content": {
              "type": "boolean",
              "default": false,
              "description": "Native GenerateContent opt-in for static or managed gemini routes; does not imply streaming, tools or media support."
            },
            "supports_messages_streaming_tools": {
              "type": "boolean",
              "default": false,
              "description": "Explicit native client-tool SSE capability; requires supports_messages_tools and supports_messages_streaming. JSON arguments are bounded and validated at block completion."
            },
            "supports_messages_tools": {
              "type": "boolean",
              "default": false,
              "description": "Explicit buffered native client-tool capability; requires supports_messages. Streaming tools require the separate supports_messages_streaming_tools capability."
            },
            "supports_messages_streaming": {
              "type": "boolean",
              "default": false,
              "description": "Explicit native text SSE opt-in; requires supports_messages."
            },
            "supports_messages": {
              "type": "boolean",
              "default": false,
              "description": "Explicit native Messages nonstreaming text capability for OpenRouter or Anthropic routes. Does not imply streaming, tools or media support."
            },
            "supports_responses": {
              "type": "boolean",
              "default": false
            }
          }
        },
        "pricing": {
          "type": [
            "object",
            "null"
          ],
          "additionalProperties": false,
          "required": [
            "currency",
            "api_prompt_rate",
            "api_completion_rate",
            "cash_prompt_rate",
            "cash_completion_rate",
            "max_input_tokens",
            "max_output_tokens"
          ],
          "properties": {
            "currency": {
              "type": "string",
              "pattern": "^[A-Z]{3}$"
            },
            "api_prompt_rate": {
              "type": "integer",
              "format": "int64",
              "minimum": 0,
              "description": "Currency nanounits per million tokens. JSON integer, not a decimal string. Platform procurement metadata only."
            },
            "api_completion_rate": {
              "type": "integer",
              "format": "int64",
              "minimum": 0,
              "description": "Currency nanounits per million tokens. JSON integer, not a decimal string. Platform procurement metadata only."
            },
            "cash_prompt_rate": {
              "type": "integer",
              "format": "int64",
              "minimum": 0,
              "description": "Currency nanounits per million tokens. JSON integer, not a decimal string. Platform procurement metadata only."
            },
            "cash_completion_rate": {
              "type": "integer",
              "format": "int64",
              "minimum": 0,
              "description": "Currency nanounits per million tokens. JSON integer, not a decimal string. Platform procurement metadata only."
            },
            "max_input_tokens": {
              "type": "integer",
              "format": "int64",
              "minimum": 1,
              "description": "Operator-attested provider token bound used for pre-dispatch liability admission; not an estimated token count."
            },
            "max_output_tokens": {
              "type": "integer",
              "format": "int64",
              "minimum": 1,
              "description": "Operator-attested provider token bound used for pre-dispatch liability admission; not an estimated token count."
            }
          },
          "description": "Confidential route procurement configuration, separate from customer selling tariffs. All fields are required when non-null. Combined charges at the configured bounds must fit a signed 64-bit nanounit amount; invalid or overflowing configurations are rejected. Personal-owned credentials require null pricing."
        },
        "revision": {
          "type": "integer",
          "minimum": 1
        }
      }
    }
  }
}
```

### HTTP 400

Invalid alias, capabilities or pricing.

### HTTP 401

Invalid or expired administrative credential.

### HTTP 403

Platform administration permission required.

### HTTP 404

Vendor does not exist.

### HTTP 409

Stale revision, existing alias or different vendor ownership.

## Behavior and supported scope

Omit expected_revision to create; provide the current revision to update. Aliases cannot be reassigned to another vendor. Disabled mappings still override static file aliases. Requires installation administration or an explicitly granted platform administrator. These platform-only route prices are procurement configuration, not customer selling tariffs. Omit pricing to preserve it on update; explicit null clears it. Changes do not rewrite previously pinned request prices.

**Supported scope:** implemented
