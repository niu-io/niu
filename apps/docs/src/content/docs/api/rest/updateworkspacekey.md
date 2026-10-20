---
title: "Update workspace API key metadata and policies"
description: "PATCH /api/v1/workspaces/{workspace}/keys/{key}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PATCH /api/v1/workspaces/{workspace}/keys/{key}`

Updates key name, model grants, spending limit, RPM/TPM/concurrency limits, and IP allowlist policy in a single request and returns the updated key detail. Omitting ip_policy leaves it unchanged. Within ip_policy, explicit allowed_cidrs: [] denies every source and null permits any source, matching the independent IP policy endpoint. Existing saved policies are not reinterpreted. Requires an installation credential or member session with workspace write access. Workspace inference API keys do not authorize key management.

Operation: `updateWorkspaceKey`.

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
curl --fail-with-body -X PATCH "$NIU_ORIGIN/api/v1/workspaces/{workspace}/keys/{key}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### workspace

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### key

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
  "type": "object"
}
```

## Responses

### HTTP 200

Updated workspace API key detail

Content type: `application/json`.

```json
{
  "description": "Workspace management key metadata and customer policies. Never contains the API secret or Provider procurement information.",
  "allOf": [
    {
      "type": "object",
      "required": [
        "id",
        "revision",
        "name",
        "allowed_models",
        "expires_at_ms",
        "last_used_at_ms",
        "revoked",
        "expired",
        "slug"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "revision": {
          "type": "integer",
          "format": "int64",
          "minimum": 1
        },
        "name": {
          "type": "string"
        },
        "allowed_models": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "expires_at_ms": {
          "type": [
            "integer",
            "null"
          ],
          "format": "int64",
          "description": "Unix milliseconds for finite expiration. Null means no automatic expiration, not an invalid or unknown timestamp. Rotation preserves this state."
        },
        "last_used_at_ms": {
          "type": [
            "integer",
            "null"
          ],
          "format": "int64",
          "description": "Latest durable dispatch intent in Unix milliseconds. Null means no attributed dispatch is recorded, not that the credential was never authenticated. Rotation preserves the old key's history; its replacement starts without a dispatch record."
        },
        "revoked": {
          "type": "boolean"
        },
        "expired": {
          "type": "boolean"
        },
        "slug": {
          "type": "string",
          "maxLength": 48,
          "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
          "description": "Stable readable slug for product URLs. Renaming preserves it."
        }
      }
    },
    {
      "type": "object",
      "required": [
        "spending_limits",
        "request_rate_limit",
        "token_rate_limit",
        "concurrency_limit",
        "token_usage_window",
        "ip_policy"
      ],
      "properties": {
        "spending_limits": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "currency",
              "limit_nanos",
              "committed_nanos",
              "remaining_nanos",
              "revision"
            ],
            "properties": {
              "currency": {
                "type": "string"
              },
              "limit_nanos": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^[0-9]+$",
                "description": "Customer allowance in currency nanounits; null means unlimited."
              },
              "committed_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$",
                "description": "Customer committed amount in currency nanounits."
              },
              "remaining_nanos": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^[0-9]+$",
                "description": "Remaining customer allowance in currency nanounits; null when unlimited."
              },
              "revision": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^[0-9]+$",
                "description": "Decimal policy revision; null means no saved policy."
              }
            }
          }
        },
        "request_rate_limit": {
          "type": "object",
          "required": [
            "requests_per_minute",
            "revision"
          ],
          "properties": {
            "requests_per_minute": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 0
            },
            "revision": {
              "type": [
                "string",
                "null"
              ],
              "pattern": "^[0-9]+$",
              "description": "Decimal policy revision; null means no saved policy."
            }
          }
        },
        "token_rate_limit": {
          "type": "object",
          "required": [
            "tokens_per_minute",
            "revision"
          ],
          "properties": {
            "tokens_per_minute": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 0
            },
            "revision": {
              "type": [
                "string",
                "null"
              ],
              "pattern": "^[0-9]+$",
              "description": "Decimal policy revision; null means no saved policy."
            },
            "snapshot_at": {
              "type": "string",
              "format": "date-time"
            },
            "known_tokens": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "reserved_tokens": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "unbounded_requests": {
              "type": "integer",
              "minimum": 0
            },
            "committed_tokens": {
              "type": [
                "string",
                "null"
              ],
              "pattern": "^[0-9]+$"
            }
          }
        },
        "concurrency_limit": {
          "type": "object",
          "required": [
            "max_concurrent_requests",
            "active_requests",
            "revision"
          ],
          "properties": {
            "max_concurrent_requests": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 0
            },
            "active_requests": {
              "type": "integer",
              "minimum": 0
            },
            "revision": {
              "type": [
                "string",
                "null"
              ],
              "pattern": "^[0-9]+$",
              "description": "Decimal policy revision; null means no saved policy."
            }
          }
        },
        "token_usage_window": {
          "anyOf": [
            {
              "type": "object",
              "required": [
                "window_seconds",
                "window_end",
                "requests",
                "known_usage_requests",
                "unknown_usage_requests",
                "known_prompt_tokens",
                "known_completion_tokens"
              ],
              "properties": {
                "window_seconds": {
                  "type": "integer",
                  "const": 60
                },
                "window_end": {
                  "type": "string",
                  "format": "date-time"
                },
                "requests": {
                  "type": "integer",
                  "minimum": 0
                },
                "known_usage_requests": {
                  "type": "integer",
                  "minimum": 0
                },
                "unknown_usage_requests": {
                  "type": "integer",
                  "minimum": 0
                },
                "known_prompt_tokens": {
                  "type": "string",
                  "pattern": "^[0-9]+$"
                },
                "known_completion_tokens": {
                  "type": "string",
                  "pattern": "^[0-9]+$"
                }
              }
            },
            {
              "type": "null"
            }
          ],
          "description": "Null when no snapshot is available; never infer zero usage."
        },
        "ip_policy": {
          "type": "object",
          "required": [
            "allowed_cidrs",
            "revision"
          ],
          "properties": {
            "allowed_cidrs": {
              "type": [
                "array",
                "null"
              ],
              "items": {
                "type": "string"
              },
              "description": "Null permits any source; an empty array denies every source."
            },
            "revision": {
              "type": [
                "string",
                "null"
              ],
              "pattern": "^[0-9]+$",
              "description": "Decimal policy revision; null means no saved policy."
            }
          }
        }
      }
    }
  ]
}
```

### HTTP 400

Invalid path, query or input. Framework parsing failures may be plain text.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "error"
  ],
  "description": "Gateway application error envelope. This does not describe framework body/path parsing failures or a proxy-generated response. Branch on error.type and HTTP status rather than matching message text.",
  "properties": {
    "error": {
      "type": "object",
      "required": [
        "message",
        "type",
        "param",
        "code"
      ],
      "properties": {
        "message": {
          "type": "string",
          "description": "Safe human-readable explanation; not a stable programmatic identifier."
        },
        "type": {
          "type": "string",
          "description": "Machine-readable failure category; new categories may be added."
        },
        "param": {
          "type": "null"
        },
        "code": {
          "type": "integer",
          "minimum": 400,
          "maximum": 599,
          "description": "HTTP status code, not a separate application error number."
        }
      }
    }
  }
}
```

Content type: `text/plain`.

```json
{
  "type": "string"
}
```

### HTTP 401

Missing, expired or revoked management credential.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "error"
  ],
  "description": "Gateway application error envelope. This does not describe framework body/path parsing failures or a proxy-generated response. Branch on error.type and HTTP status rather than matching message text.",
  "properties": {
    "error": {
      "type": "object",
      "required": [
        "message",
        "type",
        "param",
        "code"
      ],
      "properties": {
        "message": {
          "type": "string",
          "description": "Safe human-readable explanation; not a stable programmatic identifier."
        },
        "type": {
          "type": "string",
          "description": "Machine-readable failure category; new categories may be added."
        },
        "param": {
          "type": "null"
        },
        "code": {
          "type": "integer",
          "minimum": 400,
          "maximum": 599,
          "description": "HTTP status code, not a separate application error number."
        }
      }
    }
  }
}
```

### HTTP 403

Insufficient management permission.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "error"
  ],
  "description": "Gateway application error envelope. This does not describe framework body/path parsing failures or a proxy-generated response. Branch on error.type and HTTP status rather than matching message text.",
  "properties": {
    "error": {
      "type": "object",
      "required": [
        "message",
        "type",
        "param",
        "code"
      ],
      "properties": {
        "message": {
          "type": "string",
          "description": "Safe human-readable explanation; not a stable programmatic identifier."
        },
        "type": {
          "type": "string",
          "description": "Machine-readable failure category; new categories may be added."
        },
        "param": {
          "type": "null"
        },
        "code": {
          "type": "integer",
          "minimum": 400,
          "maximum": 599,
          "description": "HTTP status code, not a separate application error number."
        }
      }
    }
  }
}
```

### HTTP 404

Workspace or key not found in the authorized scope.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "error"
  ],
  "description": "Gateway application error envelope. This does not describe framework body/path parsing failures or a proxy-generated response. Branch on error.type and HTTP status rather than matching message text.",
  "properties": {
    "error": {
      "type": "object",
      "required": [
        "message",
        "type",
        "param",
        "code"
      ],
      "properties": {
        "message": {
          "type": "string",
          "description": "Safe human-readable explanation; not a stable programmatic identifier."
        },
        "type": {
          "type": "string",
          "description": "Machine-readable failure category; new categories may be added."
        },
        "param": {
          "type": "null"
        },
        "code": {
          "type": "integer",
          "minimum": 400,
          "maximum": 599,
          "description": "HTTP status code, not a separate application error number."
        }
      }
    }
  }
}
```

### HTTP 409

Revision or write conflict; reload current state before retrying.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "error"
  ],
  "description": "Gateway application error envelope. This does not describe framework body/path parsing failures or a proxy-generated response. Branch on error.type and HTTP status rather than matching message text.",
  "properties": {
    "error": {
      "type": "object",
      "required": [
        "message",
        "type",
        "param",
        "code"
      ],
      "properties": {
        "message": {
          "type": "string",
          "description": "Safe human-readable explanation; not a stable programmatic identifier."
        },
        "type": {
          "type": "string",
          "description": "Machine-readable failure category; new categories may be added."
        },
        "param": {
          "type": "null"
        },
        "code": {
          "type": "integer",
          "minimum": 400,
          "maximum": 599,
          "description": "HTTP status code, not a separate application error number."
        }
      }
    }
  }
}
```

### HTTP 413

Request body exceeds the route limit.

Content type: `text/plain`.

```json
{
  "type": "string"
}
```

### HTTP 415

Unsupported request Content-Type.

Content type: `text/plain`.

```json
{
  "type": "string"
}
```

### HTTP 422

JSON body does not match the input type.

Content type: `text/plain`.

```json
{
  "type": "string"
}
```

### HTTP 503

Durable storage or required configuration is unavailable.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "error"
  ],
  "description": "Gateway application error envelope. This does not describe framework body/path parsing failures or a proxy-generated response. Branch on error.type and HTTP status rather than matching message text.",
  "properties": {
    "error": {
      "type": "object",
      "required": [
        "message",
        "type",
        "param",
        "code"
      ],
      "properties": {
        "message": {
          "type": "string",
          "description": "Safe human-readable explanation; not a stable programmatic identifier."
        },
        "type": {
          "type": "string",
          "description": "Machine-readable failure category; new categories may be added."
        },
        "param": {
          "type": "null"
        },
        "code": {
          "type": "integer",
          "minimum": 400,
          "maximum": 599,
          "description": "HTTP status code, not a separate application error number."
        }
      }
    }
  }
}
```

## Behavior and supported scope

Updates key name, model grants, spending limit, RPM/TPM/concurrency limits, and IP allowlist policy in a single request and returns the updated key detail. Omitting ip_policy leaves it unchanged. Within ip_policy, explicit allowed_cidrs: [] denies every source and null permits any source, matching the independent IP policy endpoint. Existing saved policies are not reinterpreted. Requires an installation credential or member session with workspace write access. Workspace inference API keys do not authorize key management.

**Supported scope:** implemented
