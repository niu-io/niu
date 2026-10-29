---
title: "Read customer-safe configured text-video capabilities"
description: "GET /v1/video/models"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/video/models`

Current workspace key grants, Provider availability, personal ownership and video-compatible Guardrails apply. Omits unsupported channels/meters, callback controls and media-reference inputs. Returns only mapped output choices without credentials, upstream mappings, revisions or procurement prices. This read makes no upstream calls and does not guarantee tariffs, funds or future admission; estimate and submission recheck those independently.

Operation: `listVideoModels`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/video/models" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/video/models" \
  -H "X-Niu-API-Key: $NIU_API_KEY"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Configured text-video capabilities

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "object",
    "data"
  ],
  "properties": {
    "object": {
      "const": "list"
    },
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "object",
          "id",
          "mode",
          "input_types",
          "text",
          "maximum_body_bytes",
          "maximum_content_items",
          "controls",
          "required_controls",
          "exclusive_controls",
          "output"
        ],
        "properties": {
          "object": {
            "const": "video.model"
          },
          "id": {
            "type": "string",
            "description": "Customer model alias"
          },
          "mode": {
            "type": "string",
            "enum": [
              "owner_funded",
              "customer"
            ]
          },
          "input_types": {
            "type": "array",
            "minItems": 1,
            "maxItems": 4,
            "uniqueItems": true,
            "items": {
              "enum": [
                "text",
                "image_url",
                "audio_url",
                "video_url"
              ]
            }
          },
          "requires_image": {
            "type": "boolean"
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
              "role_required",
              "requires_text"
            ],
            "properties": {
              "maximum_items": {
                "type": "integer",
                "minimum": 1,
                "maximum": 32
              },
              "maximum_bytes": {
                "type": "integer",
                "minimum": 1
              },
              "https": {
                "type": "boolean"
              },
              "data_mime_types": {
                "type": "array",
                "uniqueItems": true,
                "items": {
                  "enum": [
                    "image/png",
                    "image/jpeg",
                    "image/webp"
                  ]
                }
              },
              "roles": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "role_required": {
                "type": "boolean"
              },
              "requires_text": {
                "type": "boolean"
              },
              "maximum_width": {
                "type": "integer",
                "minimum": 1
              },
              "maximum_height": {
                "type": "integer",
                "minimum": 1
              },
              "maximum_decoded_bytes": {
                "type": "integer",
                "minimum": 1
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
              "role_required",
              "requires_text"
            ],
            "properties": {
              "maximum_items": {
                "type": "integer",
                "minimum": 1,
                "maximum": 32
              },
              "maximum_bytes": {
                "type": "integer",
                "minimum": 1
              },
              "https": {
                "const": true
              },
              "data_mime_types": {
                "type": "array",
                "maxItems": 0,
                "items": {
                  "type": "string"
                }
              },
              "roles": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "role_required": {
                "type": "boolean"
              },
              "requires_text": {
                "const": false
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
              "role_required",
              "requires_text"
            ],
            "properties": {
              "maximum_items": {
                "type": "integer",
                "minimum": 1,
                "maximum": 32
              },
              "maximum_bytes": {
                "type": "integer",
                "minimum": 1
              },
              "https": {
                "const": true
              },
              "data_mime_types": {
                "type": "array",
                "maxItems": 0,
                "items": {
                  "type": "string"
                }
              },
              "roles": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "role_required": {
                "type": "boolean"
              },
              "requires_text": {
                "const": false
              }
            }
          },
          "text": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "maximum_items",
              "maximum_bytes"
            ],
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
              }
            }
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
          "controls": {
            "type": "object",
            "additionalProperties": {
              "oneOf": [
                {
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
                {
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
                {
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
                }
              ]
            }
          },
          "required_controls": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "exclusive_controls": {
            "type": "array",
            "items": {
              "type": "array",
              "minItems": 2,
              "maxItems": 2,
              "items": {
                "type": "string"
              }
            }
          },
          "output": {
            "description": "Null for personal Ark models without a configured output estimate; never a free billing quote.",
            "type": [
              "object",
              "null"
            ],
            "additionalProperties": false,
            "required": [
              "specifications",
              "meter",
              "estimator"
            ],
            "oneOf": [
              {
                "type": "null"
              },
              {
                "type": "object",
                "properties": {
                  "meter": {
                    "const": "video_tokens"
                  },
                  "estimator": {
                    "const": "SeedancePixelsV1"
                  }
                }
              },
              {
                "type": "object",
                "properties": {
                  "meter": {
                    "const": "seconds"
                  },
                  "estimator": {
                    "const": "OutputSecondsV1"
                  }
                }
              }
            ],
            "properties": {
              "meter": {
                "type": "string",
                "enum": [
                  "video_tokens",
                  "seconds"
                ]
              },
              "estimator": {
                "type": "string",
                "enum": [
                  "SeedancePixelsV1",
                  "OutputSecondsV1"
                ]
              },
              "specifications": {
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
              }
            }
          }
        }
      }
    }
  }
}
```

### HTTP 401

Invalid or inactive credential

### HTTP 403

Workspace permission denied

## Behavior and supported scope

Current workspace key grants, Provider availability, personal ownership and video-compatible Guardrails apply. Omits unsupported channels/meters, callback controls and media-reference inputs. Returns only mapped output choices without credentials, upstream mappings, revisions or procurement prices. This read makes no upstream calls and does not guarantee tariffs, funds or future admission; estimate and submission recheck those independently.
