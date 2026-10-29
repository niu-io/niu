---
title: "List configured model routes"
description: "GET /api/v1/models"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/models`

Company-scoped member sessions automatically include their own enabled personal models. Installation administrators may select a company with organization_id; without it only shared models are returned. Supply project_id to select an authorized workspace and resolve its effective customer selling prices. Without workspace scope customer_pricing is null; null is not a zero price and does not establish whether a workspace has a configured tariff. Personal routes also have null customer_pricing because they do not incur a Niu customer tariff. Model metadata and prices are advisory and do not qualify paid execution. Member responses omit Provider mappings, upstream names, procurement prices and credentials. Installation responses additionally include configured Provider and upstream model mappings and expose capability flags at the row root.

Operation: `adminListModels`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "adminBearerAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/models" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

### organization_id

Location: **query**. Optional. Company scope. Member sessions default to their own company; installation administrators must provide this when selecting a workspace.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### project_id

Location: **query**. Optional. Workspace scope under the legacy API field name. Must belong to the selected company and authenticated member scope. Enables effective workspace customer pricing; it does not grant access to that workspace.

```json
{
  "type": "string",
  "format": "uuid"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Authorized model metadata. Member and installation projections differ; customer_pricing contains customer selling rates only.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "oneOf": [
          {
            "description": "Member projection; no private Provider mapping or procurement information.",
            "allOf": [
              {
                "type": "object",
                "required": [
                  "id",
                  "public_catalog",
                  "catalog",
                  "customer_pricing"
                ],
                "properties": {
                  "generation_capabilities": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "chat",
                      "video"
                    ],
                    "description": "Current configured preview support, from the same visible registry snapshot. A Video-only route overrides stale catalog text metadata. Null Chat support means unknown legacy metadata, not support. Key grants, current policy, funding and upstream availability are checked separately at execution.",
                    "properties": {
                      "chat": {
                        "type": [
                          "boolean",
                          "null"
                        ]
                      },
                      "video": {
                        "type": "boolean"
                      }
                    }
                  },
                  "id": {
                    "type": "string",
                    "description": "Public model alias."
                  },
                  "public_catalog": {
                    "type": "boolean"
                  },
                  "catalog": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "name",
                      "description",
                      "context_length",
                      "max_completion_tokens",
                      "input_modalities",
                      "output_modalities",
                      "supported_parameters"
                    ],
                    "properties": {
                      "name": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "description": {
                        "type": [
                          "string",
                          "null"
                        ]
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
                        "items": {
                          "type": "string"
                        }
                      },
                      "output_modalities": {
                        "type": "array",
                        "items": {
                          "type": "string"
                        }
                      },
                      "supported_parameters": {
                        "type": "array",
                        "items": {
                          "type": "string"
                        }
                      }
                    }
                  },
                  "customer_pricing": {
                    "description": "Effective workspace customer selling tariff, or null when no workspace is selected, no tariff is resolved, or the route is personal. Null never means free. Excludes procurement rates.",
                    "anyOf": [
                      {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                          "currency",
                          "unit",
                          "prompt_rate",
                          "completion_rate",
                          "cached_prompt_rate",
                          "minimum_charge_nanos",
                          "request_fee_nanos",
                          "reasoning_completion_rate",
                          "cache_write_prompt_rate",
                          "context_tiers"
                        ],
                        "properties": {
                          "currency": {
                            "type": "string",
                            "pattern": "^[A-Z]{3}$"
                          },
                          "unit": {
                            "type": "string",
                            "const": "nanounits_per_million_tokens",
                            "description": "Unit for token rate fields only. Minimum and request fee are currency nanounits per known completed request."
                          },
                          "prompt_rate": {
                            "type": "string",
                            "pattern": "^[0-9]+$"
                          },
                          "completion_rate": {
                            "type": "string",
                            "pattern": "^[0-9]+$"
                          },
                          "minimum_charge_nanos": {
                            "type": "string",
                            "pattern": "^[0-9]+$"
                          },
                          "request_fee_nanos": {
                            "type": "string",
                            "pattern": "^[0-9]+$"
                          },
                          "cached_prompt_rate": {
                            "type": [
                              "string",
                              "null"
                            ],
                            "pattern": "^[0-9]+$"
                          },
                          "reasoning_completion_rate": {
                            "type": [
                              "string",
                              "null"
                            ],
                            "pattern": "^[0-9]+$",
                            "description": "Reported reasoning output is a subset of total completion tokens. A configured rate prices that subset separately; missing quantity remains unresolved."
                          },
                          "cache_write_prompt_rate": {
                            "type": [
                              "string",
                              "null"
                            ],
                            "pattern": "^[0-9]+$",
                            "description": "Reported cache-write input is a disjoint subset of aggregate input. A configured rate prices it separately; missing quantity remains unresolved."
                          },
                          "context_tiers": {
                            "type": "array",
                            "maxItems": 32,
                            "items": {
                              "type": "object",
                              "additionalProperties": false,
                              "required": [
                                "minimum_input_tokens",
                                "prompt_rate",
                                "completion_rate"
                              ],
                              "properties": {
                                "minimum_input_tokens": {
                                  "type": "string",
                                  "pattern": "^[0-9]+$",
                                  "description": "Positive inclusive aggregate input threshold, at most 9223372036854775807."
                                },
                                "prompt_rate": {
                                  "type": "string",
                                  "pattern": "^[0-9]+$",
                                  "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
                                },
                                "completion_rate": {
                                  "type": "string",
                                  "pattern": "^[0-9]+$",
                                  "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
                                },
                                "cached_prompt_rate": {
                                  "type": [
                                    "string",
                                    "null"
                                  ],
                                  "pattern": "^[0-9]+$",
                                  "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
                                },
                                "cache_write_prompt_rate": {
                                  "type": [
                                    "string",
                                    "null"
                                  ],
                                  "pattern": "^[0-9]+$",
                                  "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
                                },
                                "reasoning_completion_rate": {
                                  "type": [
                                    "string",
                                    "null"
                                  ],
                                  "pattern": "^[0-9]+$",
                                  "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
                                }
                              }
                            },
                            "description": "Complete whole-request schedules; highest inclusive input threshold wins. Null category rates do not inherit the base schedule. Empty array clears tiers; omitting existing tiers conflicts."
                          },
                          "pricing_source": {
                            "type": "string",
                            "enum": [
                              "workspace",
                              "platform"
                            ]
                          },
                          "promotion_scope": {
                            "type": [
                              "string",
                              "null"
                            ],
                            "enum": [
                              "global",
                              "customer",
                              null
                            ]
                          },
                          "selected_at": {
                            "type": "string",
                            "pattern": "^[0-9]+$"
                          },
                          "price_version": {
                            "type": "string",
                            "pattern": "^[0-9]+$"
                          }
                        }
                      },
                      {
                        "type": "null"
                      }
                    ]
                  }
                }
              },
              {
                "type": "object",
                "required": [
                  "capabilities"
                ],
                "properties": {
                  "capabilities": {
                    "type": "object",
                    "required": [
                      "supports_embeddings",
                      "supports_embedding_dimensions",
                      "supports_embedding_base64",
                      "supports_tool_calls",
                      "supports_streaming_tool_calls",
                      "supports_structured_output",
                      "supports_messages",
                      "supports_messages_streaming",
                      "supports_messages_tools",
                      "supports_messages_streaming_tools",
                      "supports_generate_content",
                      "supports_responses"
                    ],
                    "properties": {
                      "supports_embeddings": {
                        "type": "boolean"
                      },
                      "supports_embedding_dimensions": {
                        "type": "boolean"
                      },
                      "supports_embedding_base64": {
                        "type": "boolean"
                      },
                      "supports_tool_calls": {
                        "type": "boolean"
                      },
                      "supports_streaming_tool_calls": {
                        "type": "boolean"
                      },
                      "supports_structured_output": {
                        "type": "boolean"
                      },
                      "supports_messages": {
                        "type": "boolean"
                      },
                      "supports_messages_streaming": {
                        "type": "boolean"
                      },
                      "supports_messages_tools": {
                        "type": "boolean"
                      },
                      "supports_messages_streaming_tools": {
                        "type": "boolean"
                      },
                      "supports_generate_content": {
                        "type": "boolean"
                      },
                      "supports_responses": {
                        "type": "boolean"
                      }
                    }
                  }
                }
              }
            ],
            "unevaluatedProperties": false
          },
          {
            "description": "Installation-only projection with configured Provider/upstream mapping. Credentials and procurement prices are excluded.",
            "allOf": [
              {
                "type": "object",
                "required": [
                  "id",
                  "public_catalog",
                  "catalog",
                  "customer_pricing"
                ],
                "properties": {
                  "generation_capabilities": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "chat",
                      "video"
                    ],
                    "description": "Current configured preview support, from the same visible registry snapshot. A Video-only route overrides stale catalog text metadata. Null Chat support means unknown legacy metadata, not support. Key grants, current policy, funding and upstream availability are checked separately at execution.",
                    "properties": {
                      "chat": {
                        "type": [
                          "boolean",
                          "null"
                        ]
                      },
                      "video": {
                        "type": "boolean"
                      }
                    }
                  },
                  "id": {
                    "type": "string",
                    "description": "Public model alias."
                  },
                  "public_catalog": {
                    "type": "boolean"
                  },
                  "catalog": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "name",
                      "description",
                      "context_length",
                      "max_completion_tokens",
                      "input_modalities",
                      "output_modalities",
                      "supported_parameters"
                    ],
                    "properties": {
                      "name": {
                        "type": [
                          "string",
                          "null"
                        ]
                      },
                      "description": {
                        "type": [
                          "string",
                          "null"
                        ]
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
                        "items": {
                          "type": "string"
                        }
                      },
                      "output_modalities": {
                        "type": "array",
                        "items": {
                          "type": "string"
                        }
                      },
                      "supported_parameters": {
                        "type": "array",
                        "items": {
                          "type": "string"
                        }
                      }
                    }
                  },
                  "customer_pricing": {
                    "description": "Effective workspace customer selling tariff, or null when no workspace is selected, no tariff is resolved, or the route is personal. Null never means free. Excludes procurement rates.",
                    "anyOf": [
                      {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                          "currency",
                          "unit",
                          "prompt_rate",
                          "completion_rate",
                          "cached_prompt_rate",
                          "minimum_charge_nanos",
                          "request_fee_nanos",
                          "reasoning_completion_rate",
                          "cache_write_prompt_rate",
                          "context_tiers"
                        ],
                        "properties": {
                          "currency": {
                            "type": "string",
                            "pattern": "^[A-Z]{3}$"
                          },
                          "unit": {
                            "type": "string",
                            "const": "nanounits_per_million_tokens",
                            "description": "Unit for token rate fields only. Minimum and request fee are currency nanounits per known completed request."
                          },
                          "prompt_rate": {
                            "type": "string",
                            "pattern": "^[0-9]+$"
                          },
                          "completion_rate": {
                            "type": "string",
                            "pattern": "^[0-9]+$"
                          },
                          "minimum_charge_nanos": {
                            "type": "string",
                            "pattern": "^[0-9]+$"
                          },
                          "request_fee_nanos": {
                            "type": "string",
                            "pattern": "^[0-9]+$"
                          },
                          "cached_prompt_rate": {
                            "type": [
                              "string",
                              "null"
                            ],
                            "pattern": "^[0-9]+$"
                          },
                          "reasoning_completion_rate": {
                            "type": [
                              "string",
                              "null"
                            ],
                            "pattern": "^[0-9]+$",
                            "description": "Reported reasoning output is a subset of total completion tokens. A configured rate prices that subset separately; missing quantity remains unresolved."
                          },
                          "cache_write_prompt_rate": {
                            "type": [
                              "string",
                              "null"
                            ],
                            "pattern": "^[0-9]+$",
                            "description": "Reported cache-write input is a disjoint subset of aggregate input. A configured rate prices it separately; missing quantity remains unresolved."
                          },
                          "context_tiers": {
                            "type": "array",
                            "maxItems": 32,
                            "items": {
                              "type": "object",
                              "additionalProperties": false,
                              "required": [
                                "minimum_input_tokens",
                                "prompt_rate",
                                "completion_rate"
                              ],
                              "properties": {
                                "minimum_input_tokens": {
                                  "type": "string",
                                  "pattern": "^[0-9]+$",
                                  "description": "Positive inclusive aggregate input threshold, at most 9223372036854775807."
                                },
                                "prompt_rate": {
                                  "type": "string",
                                  "pattern": "^[0-9]+$",
                                  "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
                                },
                                "completion_rate": {
                                  "type": "string",
                                  "pattern": "^[0-9]+$",
                                  "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
                                },
                                "cached_prompt_rate": {
                                  "type": [
                                    "string",
                                    "null"
                                  ],
                                  "pattern": "^[0-9]+$",
                                  "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
                                },
                                "cache_write_prompt_rate": {
                                  "type": [
                                    "string",
                                    "null"
                                  ],
                                  "pattern": "^[0-9]+$",
                                  "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
                                },
                                "reasoning_completion_rate": {
                                  "type": [
                                    "string",
                                    "null"
                                  ],
                                  "pattern": "^[0-9]+$",
                                  "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
                                }
                              }
                            },
                            "description": "Complete whole-request schedules; highest inclusive input threshold wins. Null category rates do not inherit the base schedule. Empty array clears tiers; omitting existing tiers conflicts."
                          },
                          "pricing_source": {
                            "type": "string",
                            "enum": [
                              "workspace",
                              "platform"
                            ]
                          },
                          "promotion_scope": {
                            "type": [
                              "string",
                              "null"
                            ],
                            "enum": [
                              "global",
                              "customer",
                              null
                            ]
                          },
                          "selected_at": {
                            "type": "string",
                            "pattern": "^[0-9]+$"
                          },
                          "price_version": {
                            "type": "string",
                            "pattern": "^[0-9]+$"
                          }
                        }
                      },
                      {
                        "type": "null"
                      }
                    ]
                  }
                }
              },
              {
                "type": "object",
                "required": [
                  "supports_embeddings",
                  "supports_embedding_dimensions",
                  "supports_embedding_base64",
                  "supports_tool_calls",
                  "supports_streaming_tool_calls",
                  "supports_structured_output",
                  "supports_messages",
                  "supports_messages_streaming",
                  "supports_messages_tools",
                  "supports_messages_streaming_tools",
                  "supports_generate_content",
                  "supports_responses"
                ],
                "properties": {
                  "supports_embeddings": {
                    "type": "boolean"
                  },
                  "supports_embedding_dimensions": {
                    "type": "boolean"
                  },
                  "supports_embedding_base64": {
                    "type": "boolean"
                  },
                  "supports_tool_calls": {
                    "type": "boolean"
                  },
                  "supports_streaming_tool_calls": {
                    "type": "boolean"
                  },
                  "supports_structured_output": {
                    "type": "boolean"
                  },
                  "supports_messages": {
                    "type": "boolean"
                  },
                  "supports_messages_streaming": {
                    "type": "boolean"
                  },
                  "supports_messages_tools": {
                    "type": "boolean"
                  },
                  "supports_messages_streaming_tools": {
                    "type": "boolean"
                  },
                  "supports_generate_content": {
                    "type": "boolean"
                  },
                  "supports_responses": {
                    "type": "boolean"
                  }
                }
              },
              {
                "type": "object",
                "required": [
                  "provider",
                  "upstream_model"
                ],
                "properties": {
                  "provider": {
                    "type": "string"
                  },
                  "upstream_model": {
                    "type": "string"
                  }
                }
              }
            ],
            "unevaluatedProperties": false
          }
        ]
      }
    }
  }
}
```

### HTTP 401

Missing or invalid administrator credentials.

### HTTP 404

Selected account is outside the authenticated scope.

## Behavior and supported scope

Company-scoped member sessions automatically include their own enabled personal models. Installation administrators may select a company with organization_id; without it only shared models are returned. Supply project_id to select an authorized workspace and resolve its effective customer selling prices. Without workspace scope customer_pricing is null; null is not a zero price and does not establish whether a workspace has a configured tariff. Personal routes also have null customer_pricing because they do not incur a Niu customer tariff. Model metadata and prices are advisory and do not qualify paid execution. Member responses omit Provider mappings, upstream names, procurement prices and credentials. Installation responses additionally include configured Provider and upstream model mappings and expose capability flags at the row root.
