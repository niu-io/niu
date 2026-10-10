---
title: Implemented API operations
description: Handler-generated parameters, request bodies, responses and schemas.
---

Generated from backend handler annotations. Do not edit directly.

This is the annotated subset, not the complete API. See the [API overview](/docs/reference/api/) and [root OpenAPI contract](https://github.com/niu-io/niu/blob/main/contracts/openapi.yaml) for the broader interface.

## Read API key concurrency policy

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/concurrency-limit`

Scoped readers may inspect the policy shared across secret rotations.

Implementation: `implemented`. Operation: `getKeyConcurrencyLimit`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`key` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Null revision means never configured. Null removes the limit; zero denies dispatch.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "$ref": "#/components/schemas/KeyConcurrencyPolicy"
    }
  }
}
```

HTTP 401: Authentication required

HTTP 403: Workspace access denied

HTTP 404: Workspace is outside operator scope, or key is absent from authorized workspace

## Set API key concurrency policy

`PUT /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/concurrency-limit`

Owner or installation administrator only. Rotation preserves this policy. Does not cancel already admitted requests.

Implementation: `implemented`. Operation: `setKeyConcurrencyLimit`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`key` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Request body

Required.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "max_concurrent_requests",
    "expected_revision"
  ],
  "properties": {
    "max_concurrent_requests": {
      "$ref": "#/components/schemas/KeyConcurrencyConcurrencyLimit"
    },
    "expected_revision": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Zero for initial configuration; maximum 9223372036854775806."
    }
  }
}
```

### Responses

HTTP 200: New policy and immutable history committed atomically. Existing unresolved work remains counted across revisions.

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
        "revision"
      ],
      "properties": {
        "revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        }
      }
    }
  }
}
```

HTTP 400: Invalid limit or revision

HTTP 401: Authentication required

HTTP 403: Owner permission required

HTTP 404: Workspace is outside operator scope, or key is absent from authorized workspace

HTTP 409: Stale policy revision

HTTP 422: Missing or invalid JSON fields

## List API key concurrency policy history

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/concurrency-limit/history`

Scoped readers receive descending revisions shared across rotations. Use the last revision as the next page cursor.

Implementation: `implemented`. Operation: `listKeyConcurrencyLimitHistory`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`key` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`before_revision` (query, optional)

```json
{
  "type": "integer",
  "minimum": 1
}
```

`limit` (query, optional)

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 50
}
```

### Responses

HTTP 200: Immutable policy history; no internal actor identifiers.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "max_concurrent_requests",
          "revision",
          "recorded_at",
          "actor_kind",
          "actor_name"
        ],
        "properties": {
          "max_concurrent_requests": {
            "$ref": "#/components/schemas/KeyConcurrencyConcurrencyLimit"
          },
          "revision": {
            "type": "string",
            "pattern": "^[1-9][0-9]*$"
          },
          "recorded_at": {
            "type": "string",
            "format": "date-time"
          },
          "actor_kind": {
            "type": "string",
            "enum": [
              "installation",
              "member"
            ]
          },
          "actor_name": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

HTTP 400: Invalid pagination

HTTP 401: Authentication required

HTTP 403: Workspace access denied

HTTP 404: Workspace is outside operator scope, or key is absent from authorized workspace

## Read API key source policy

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/ip-policy`

Scoped readers may inspect the policy shared across secret rotations.

Implementation: `implemented`. Operation: `getKeyIpPolicy`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`key` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Null revision means never configured. Null networks permit all sources; an empty array denies all sources.

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
        "allowed_cidrs",
        "revision"
      ],
      "properties": {
        "allowed_cidrs": {
          "type": [
            "array",
            "null"
          ],
          "maxItems": 64,
          "items": {
            "type": "string",
            "maxLength": 64
          },
          "description": "IPv4/IPv6 addresses or CIDRs, normalized to network CIDRs. Null permits all; empty denies all."
        },
        "revision": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[1-9][0-9]*$"
        }
      }
    }
  }
}
```

HTTP 401: Authentication required

HTTP 403: Workspace access denied

HTTP 404: Workspace is outside operator scope, or key is absent from authorized workspace

## Set API key source policy

`PUT /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/ip-policy`

Owner or installation administrator only. Rotation preserves this policy. Does not cancel already admitted requests.

Implementation: `implemented`. Operation: `setKeyIpPolicy`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`key` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Request body

Required.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "allowed_cidrs",
    "expected_revision"
  ],
  "properties": {
    "allowed_cidrs": {
      "type": [
        "array",
        "null"
      ],
      "maxItems": 64,
      "items": {
        "type": "string",
        "maxLength": 64
      },
      "description": "IPv4/IPv6 addresses or CIDRs, normalized to network CIDRs. Null permits all; empty denies all."
    },
    "expected_revision": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Zero for initial configuration; maximum 9223372036854775806."
    }
  }
}
```

### Responses

HTTP 200: New policy and immutable history committed atomically.

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
        "revision"
      ],
      "properties": {
        "revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        }
      }
    }
  }
}
```

HTTP 400: Invalid network or revision

HTTP 401: Authentication required

HTTP 403: Owner permission required

HTTP 404: Workspace is outside operator scope, or key is absent from authorized workspace

HTTP 409: Stale policy revision

HTTP 422: Missing or invalid JSON fields

## List API key source policy history

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/ip-policy/history`

Scoped readers receive descending revisions shared across rotations. Use the last revision as the next page cursor.

Implementation: `implemented`. Operation: `listKeyIpPolicyHistory`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`key` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`before_revision` (query, optional)

```json
{
  "type": "integer",
  "minimum": 1
}
```

`limit` (query, optional)

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 50
}
```

### Responses

HTTP 200: Immutable policy history; no internal actor identifiers.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "allowed_cidrs",
          "revision",
          "recorded_at",
          "actor_kind",
          "actor_name"
        ],
        "properties": {
          "allowed_cidrs": {
            "type": [
              "array",
              "null"
            ],
            "maxItems": 64,
            "items": {
              "type": "string",
              "maxLength": 64
            },
            "description": "IPv4/IPv6 addresses or CIDRs, normalized to network CIDRs. Null permits all; empty denies all."
          },
          "revision": {
            "type": "string",
            "pattern": "^[1-9][0-9]*$"
          },
          "recorded_at": {
            "type": "string",
            "format": "date-time"
          },
          "actor_kind": {
            "type": "string",
            "enum": [
              "installation",
              "member"
            ]
          },
          "actor_name": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

HTTP 400: Invalid pagination

HTTP 401: Authentication required

HTTP 403: Workspace access denied

HTTP 404: Workspace is outside operator scope, or key is absent from authorized workspace

## Read API key request rate policy

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/request-rate-limit`

Scoped readers may inspect the policy shared across secret rotations.

Implementation: `implemented`. Operation: `getKeyRequestRateLimit`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`key` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Null revision means never configured. Null removes the limit; zero denies dispatch.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "$ref": "#/components/schemas/KeyRequestRatePolicy"
    }
  }
}
```

HTTP 401: Authentication required

HTTP 403: Workspace access denied

HTTP 404: Workspace is outside operator scope, or key is absent from authorized workspace

## Read API key token usage window

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/token-usage-window`

Scoped reader access. Dispatches in the rolling 60 seconds ending at window_end, across secret rotations. Known subtotals exclude unknown requests; zero known tokens does not mean zero actual usage. This endpoint does not enforce TPM and exposes no Supplier cost.

Implementation: `implemented`. Operation: `getKeyTokenUsageWindow`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`key` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: One consistent database snapshot, including an empty window for an unused key.

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
    }
  }
}
```

HTTP 401: Authentication required

HTTP 403: Read permission required

HTTP 404: Workspace outside operator scope or key absent from workspace

## Set API key request rate policy

`PUT /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/request-rate-limit`

Owner or installation administrator only. Rotation preserves this policy. Does not cancel already admitted requests.

Implementation: `implemented`. Operation: `setKeyRequestRateLimit`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`key` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Request body

Required.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "requests_per_minute",
    "expected_revision"
  ],
  "properties": {
    "requests_per_minute": {
      "$ref": "#/components/schemas/KeyRequestRateRequestLimit"
    },
    "expected_revision": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Zero for initial configuration; maximum 9223372036854775806."
    }
  }
}
```

### Responses

HTTP 200: New policy and immutable history committed atomically. Rolling windows persist across revisions.

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
        "revision"
      ],
      "properties": {
        "revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        }
      }
    }
  }
}
```

HTTP 400: Invalid limit or revision

HTTP 401: Authentication required

HTTP 403: Owner permission required

HTTP 404: Workspace is outside operator scope, or key is absent from authorized workspace

HTTP 409: Stale policy revision

HTTP 422: Missing or invalid JSON fields

## List API key request rate policy history

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/request-rate-limit/history`

Scoped readers receive descending revisions shared across rotations. Use the last revision as the next page cursor.

Implementation: `implemented`. Operation: `listKeyRequestRateLimitHistory`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`key` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`before_revision` (query, optional)

```json
{
  "type": "integer",
  "minimum": 1
}
```

`limit` (query, optional)

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 50
}
```

### Responses

HTTP 200: Immutable policy history; no internal actor identifiers.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "requests_per_minute",
          "revision",
          "recorded_at",
          "actor_kind",
          "actor_name"
        ],
        "properties": {
          "requests_per_minute": {
            "$ref": "#/components/schemas/KeyRequestRateRequestLimit"
          },
          "revision": {
            "type": "string",
            "pattern": "^[1-9][0-9]*$"
          },
          "recorded_at": {
            "type": "string",
            "format": "date-time"
          },
          "actor_kind": {
            "type": "string",
            "enum": [
              "installation",
              "member"
            ]
          },
          "actor_name": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

HTTP 400: Invalid pagination

HTTP 401: Authentication required

HTTP 403: Workspace access denied

HTTP 404: Workspace is outside operator scope, or key is absent from authorized workspace

## List API key spending limits

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit`

Scoped readers may inspect customer commitments. Rotated keys share the original spending identity. Personal upstream routes do not consume customer funds. No Supplier costs or company balance are exposed.

Implementation: `implemented`. Operation: `listKeySpendingLimits`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`key` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Account currencies and lifetime key commitments; null limit means unlimited and null revision means never configured.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "currency",
          "limit_nanos",
          "revision",
          "committed_nanos",
          "remaining_nanos"
        ],
        "properties": {
          "currency": {
            "type": "string",
            "pattern": "^[A-Z]{3}$"
          },
          "limit_nanos": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$"
          },
          "revision": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$"
          },
          "committed_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "remaining_nanos": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$",
            "description": "Maximum of cap minus committed customer amount and zero; null for unlimited. This is key allowance only, not company balance or guaranteed admission."
          }
        }
      }
    }
  }
}
```

HTTP 401: Authentication required

HTTP 403: Workspace access denied

HTTP 404: Key does not exist in the authorized workspace

## Set API key spending limit

`PUT /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit/{currency}`

Workspace/company owner or installation administrator. Cap includes settled customer charges minus refunds plus unreleased reservations, across secret rotations. Lowering below committed liability is rejected. Account and workspace limits still apply. Writes do not add funds. Null explicitly restores unlimited; omission is rejected.

Implementation: `implemented`. Operation: `setKeySpendingLimit`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`key` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`currency` (path, required)

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
}
```

### Request body

Required.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "limit_nanos",
    "expected_revision"
  ],
  "properties": {
    "limit_nanos": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$",
      "description": "Nonnegative signed-64-bit nanounits or explicit null."
    },
    "expected_revision": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Zero for initial configuration; maximum 9223372036854775806."
    }
  }
}
```

### Responses

HTTP 200: New immutable policy revision recorded.

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        }
      }
    }
  }
}
```

HTTP 400: Invalid amount or currency

HTTP 401: Authentication required

HTTP 402: Proposed limit is below committed key liability

HTTP 403: Owner permission required

HTTP 404: Key does not exist in the authorized workspace

HTTP 409: Stale revision, missing account, or unresolved attribution

HTTP 422: Missing or invalid body fields

## List API key spending history

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit/{currency}/history`

Descending immutable revision history shared across rotations. Use the last returned revision as before_revision for the next page. Returns currency, nullable limit_nanos, revision, recorded_at, actor_kind and actor_name; never an internal actor identifier.

Implementation: `implemented`. Operation: `listKeySpendingLimitHistory`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`key` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`currency` (path, required)

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
}
```

`before_revision` (query, optional)

```json
{
  "type": "integer",
  "minimum": 1
}
```

`limit` (query, optional)

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 50
}
```

### Responses

HTTP 200: Data array of policy revisions

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "currency",
          "limit_nanos",
          "revision",
          "recorded_at",
          "actor_kind",
          "actor_name"
        ],
        "properties": {
          "currency": {
            "type": "string",
            "pattern": "^[A-Z]{3}$"
          },
          "limit_nanos": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$"
          },
          "revision": {
            "type": "string",
            "pattern": "^[1-9][0-9]*$"
          },
          "recorded_at": {
            "type": "string",
            "format": "date-time"
          },
          "actor_kind": {
            "type": "string",
            "enum": [
              "installation",
              "member"
            ]
          },
          "actor_name": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

HTTP 400: Invalid currency or pagination

HTTP 401: Authentication required

HTTP 403: Workspace access denied

HTTP 404: Key does not exist in the authorized workspace

## Read API key token rate policy

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/token-rate-limit`

Scoped readers may inspect the policy shared across secret rotations.

Implementation: `implemented`. Operation: `getKeyTokenRateLimit`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`key` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Null revision means never configured. Null removes the limit; zero denies dispatch.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "$ref": "#/components/schemas/KeyTokenRatePolicy"
    }
  }
}
```

HTTP 401: Authentication required

HTTP 403: Workspace access denied

HTTP 404: Workspace is outside operator scope, or key is absent from authorized workspace

## Set API key token rate policy

`PUT /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/token-rate-limit`

Owner or installation administrator only. Rotation preserves this policy. Does not cancel already admitted requests.

Implementation: `implemented`. Operation: `setKeyTokenRateLimit`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`key` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Request body

Required.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "tokens_per_minute",
    "expected_revision"
  ],
  "properties": {
    "tokens_per_minute": {
      "$ref": "#/components/schemas/KeyTokenRateTokenRateLimit"
    },
    "expected_revision": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Zero for initial configuration; maximum 9223372036854775806."
    }
  }
}
```

### Responses

HTTP 200: New policy and immutable history committed atomically. Existing unresolved work remains counted across revisions.

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
        "revision"
      ],
      "properties": {
        "revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        }
      }
    }
  }
}
```

HTTP 400: Invalid limit or revision

HTTP 401: Authentication required

HTTP 403: Owner permission required

HTTP 404: Workspace is outside operator scope, or key is absent from authorized workspace

HTTP 409: Stale policy revision

HTTP 422: Missing or invalid JSON fields

## List API key token rate policy history

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/token-rate-limit/history`

Scoped readers receive descending revisions shared across rotations. Use the last revision as the next page cursor.

Implementation: `implemented`. Operation: `listKeyTokenRateLimitHistory`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`key` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`before_revision` (query, optional)

```json
{
  "type": "integer",
  "minimum": 1
}
```

`limit` (query, optional)

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 50
}
```

### Responses

HTTP 200: Immutable policy history; no internal actor identifiers.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "tokens_per_minute",
          "revision",
          "recorded_at",
          "actor_kind",
          "actor_name"
        ],
        "properties": {
          "tokens_per_minute": {
            "$ref": "#/components/schemas/KeyTokenRateTokenRateLimit"
          },
          "revision": {
            "type": "string",
            "pattern": "^[1-9][0-9]*$"
          },
          "recorded_at": {
            "type": "string",
            "format": "date-time"
          },
          "actor_kind": {
            "type": "string",
            "enum": [
              "installation",
              "member"
            ]
          },
          "actor_name": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

HTTP 400: Invalid pagination

HTTP 401: Authentication required

HTTP 403: Workspace access denied

HTTP 404: Workspace is outside operator scope, or key is absent from authorized workspace

## List workspace spending currencies

`GET /admin/v1/organizations/{organization}/projects/{project}/spending-limit`

Workspace readers may discover company account currencies and this workspace commitment without company-balance access. Absent limits and revisions are null. No state is changed.

Implementation: `implemented`. Operation: `listWorkspaceSpendingLimits`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Current scoped state

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/WorkspaceSpendingSummary"
      }
    }
  }
}
```

HTTP 401: Authentication required

HTTP 403: Insufficient role permissions

HTTP 404: Workspace unavailable in the authorized scope

HTTP 400: Invalid currency, decimal value or history query

## Read a workspace spending limit

`GET /admin/v1/organizations/{organization}/projects/{project}/spending-limit/{currency}`

Workspace read permission required. Returns data: null when no explicit limit exists. Does not expose company funds or other workspace usage.

Implementation: `implemented`. Operation: `getWorkspaceSpendingLimit`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`currency` (path, required)

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
}
```

### Responses

HTTP 200: Current scoped state

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "oneOf": [
        {
          "$ref": "#/components/schemas/WorkspaceSpendingSummary"
        },
        {
          "type": "null"
        }
      ]
    }
  }
}
```

HTTP 401: Authentication required

HTTP 403: Insufficient role permissions

HTTP 404: Workspace unavailable in the authorized scope

HTTP 400: Invalid currency, decimal value or history query

## Set a workspace spending limit

`PUT /admin/v1/organizations/{organization}/projects/{project}/spending-limit/{currency}`

Scoped owner or installation administrator required. Both input fields are nonnegative decimal strings, not null. expected_revision 0 creates the first limit; later writes require the saved revision. Zero denies new paid liability; there is no null reset on this endpoint. A limit below existing commitment is rejected. Writes append actor history and never change company funds.

Implementation: `implemented`. Operation: `setWorkspaceSpendingLimit`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`currency` (path, required)

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
}
```

### Request body

Required.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/WorkspaceSpendingInput"
}
```

### Responses

HTTP 200: Current scoped state

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
        "revision"
      ],
      "properties": {
        "revision": {
          "type": "string",
          "pattern": "^[0-9]+$",
          "description": "Exact nonnegative decimal integer, within signed 64-bit range."
        }
      }
    }
  }
}
```

HTTP 401: Authentication required

HTTP 403: Insufficient role permissions

HTTP 404: Workspace unavailable in the authorized scope

HTTP 400: Invalid currency, decimal value or history query

HTTP 402: Limit is below existing workspace commitment

HTTP 409: Revision conflict or unavailable currency account

HTTP 422: JSON input shape is invalid

## List workspace spending revisions

`GET /admin/v1/organizations/{organization}/projects/{project}/spending-limit/{currency}/history`

Workspace read permission required. Descending immutable history. before_revision is exclusive. next_before_revision is a decimal string or null; an exactly full final page can yield an empty following page. Baseline timestamps and actor data may be null.

Implementation: `implemented`. Operation: `listWorkspaceSpendingLimitHistory`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`currency` (path, required)

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
}
```

`before_revision` (query, optional)

```json
{
  "type": "integer",
  "format": "int64",
  "minimum": 1
}
```

`limit` (query, optional)

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 50
}
```

### Responses

HTTP 200: Current scoped state

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_before_revision"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/WorkspaceSpendingHistory"
      }
    },
    "next_before_revision": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$",
      "description": "Exact nonnegative decimal integer, within signed 64-bit range."
    }
  }
}
```

HTTP 401: Authentication required

HTTP 403: Insufficient role permissions

HTTP 404: Workspace unavailable in the authorized scope

HTTP 400: Invalid currency, decimal value or history query

## Update workspace API key name and model grants

`PATCH /admin/v1/organizations/{organization}/projects/{project}/keys/{key}`

Requires workspace write access. Changes the saved name and model grants without returning or rotating the secret or extending expiry. Subsequent requests use the current grants; this does not cancel already dispatched requests. expected_revision is an integer, unlike decimal-string policy revisions. A no-op edit retains its revision; a changed edit increments it. Model aliases must exist in the authorized scope. The wildcard must be the sole grant.

Implementation: `implemented`. Operation: `updateKeyMetadata`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`key` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Request body

Required.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "name",
    "allowed_models",
    "expected_revision"
  ],
  "properties": {
    "name": {
      "type": "string",
      "description": "Trimmed before persistence; must be nonempty and at most 200 UTF-8 bytes."
    },
    "allowed_models": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string"
      },
      "description": "Existing scoped aliases, each nonempty and at most 200 UTF-8 bytes; [\"*\"] grants all eligible models."
    },
    "expected_revision": {
      "type": "integer",
      "format": "int64",
      "minimum": 1
    }
  }
}
```

### Responses

HTTP 200: Current metadata revision; no secret is returned

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "revision"
  ],
  "properties": {
    "revision": {
      "type": "integer",
      "format": "int64",
      "minimum": 1
    }
  }
}
```

HTTP 400: Invalid name, model grants or revision

HTTP 401: Authentication required

HTTP 403: Write permission required

HTTP 404: Workspace access not granted

HTTP 409: Stale revision, missing key, revoked key or expired key

HTTP 422: Invalid JSON shape, missing or unknown fields

HTTP 503: Durable storage unavailable

## Read a recorded gateway request

`GET /admin/v1/organizations/{organization}/projects/{project}/requests/{attempt}`

Scoped workspace read access required. Returns persisted metadata, usage, timing, safe failure classification and customer charges without prompts, response bodies or Supplier procurement costs. Missing or foreign attempts return 404. Unknown values remain null. Legacy correlation fields are opaque metadata. Does not contact the upstream service or change billing.

Implementation: `implemented`. Operation: `getGatewayRequest`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`project` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`attempt` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Saved request metadata. Cache-Control: no-store.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "$ref": "#/components/schemas/GatewayRequestMetadata"
    }
  }
}
```

HTTP 401: Authentication required

HTTP 403: Workspace read permission denied

HTTP 404: Workspace or request unavailable in this scope

## Read EPay configuration with platform administrator read access

`GET /admin/v1/platform/payments/epay`

Returns enabled, merchant_id, endpoint, notify_url, return_url, methods, has_key and an exact string revision. Never returns merchant keys. Without a saved configuration, reads sanitized deployment defaults.

Implementation: `implemented`. Operation: `getPlatformEPayConfiguration`.

### Responses

HTTP 200: Sanitized configuration in data

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "$ref": "#/components/schemas/EPayConfiguration"
    }
  }
}
```

HTTP 401: Authentication required

HTTP 403: Platform administrator access required

HTTP 502: Encryption unavailable or stored configuration cannot be opened

HTTP 503: Durable storage unavailable

## Save encrypted EPay configuration with platform administrator write access

`PUT /admin/v1/platform/payments/epay`

Validates enabled checkout configuration before persistence. An empty key retains the stored credential. Exact expected_revision prevents overwriting concurrent edits. Pending EPay orders prevent configuration changes so their original verification settings remain available. Saves an append-only audit event and takes effect without restarting the gateway. This configures the classic EPay protocol; it does not establish merchant eligibility or live payment qualification. Supported method names and uniqueness are validated even when disabled; a disabled draft may use an empty methods list.

Implementation: `implemented`. Operation: `savePlatformEPayConfiguration`.

### Request body

Required.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "expected_revision",
    "enabled",
    "merchant_id",
    "key",
    "endpoint",
    "notify_url",
    "return_url",
    "methods"
  ],
  "properties": {
    "expected_revision": {
      "type": "string",
      "pattern": "^[0-9]+$"
    },
    "enabled": {
      "type": "boolean"
    },
    "merchant_id": {
      "type": "string"
    },
    "key": {
      "type": "string",
      "writeOnly": true
    },
    "endpoint": {
      "type": "string"
    },
    "notify_url": {
      "type": "string"
    },
    "return_url": {
      "type": "string"
    },
    "methods": {
      "type": "array",
      "maxItems": 2,
      "uniqueItems": true,
      "items": {
        "type": "string",
        "enum": [
          "alipay",
          "wxpay"
        ]
      }
    }
  }
}
```

### Responses

HTTP 200: Sanitized saved configuration in data, without key

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "$ref": "#/components/schemas/EPayConfiguration"
    }
  }
}
```

HTTP 400: Invalid configuration

HTTP 401: Authentication required

HTTP 403: Platform administrator write access required

HTTP 409: Revision conflict or unresolved payment orders

HTTP 503: Durable storage unavailable

HTTP 502: Encryption unavailable or stored configuration cannot be opened

HTTP 422: Malformed JSON shape, missing fields or unknown fields

## List supported payment integrations

`GET /admin/v1/platform/payments/integrations`

Installation administrator only. Capability inventory is independent of merchant activation. Returns no merchant configuration or credentials. Refunds means refund initiation; query recovery is limited to the declared scope.

Implementation: `implemented`. Operation: `listPaymentIntegrations`.

### Responses

HTTP 200: Supported integrations, not enabled customer checkout methods

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "name",
          "configuration",
          "checkout",
          "signed_notifications",
          "query_recovery",
          "refunds"
        ],
        "properties": {
          "id": {
            "type": "string",
            "enum": [
              "epay",
              "stripe",
              "zhifux"
            ]
          },
          "name": {
            "type": "string"
          },
          "configuration": {
            "type": "string",
            "enum": [
              "administration_api",
              "server_environment",
              "server_file"
            ]
          },
          "checkout": {
            "type": "boolean"
          },
          "signed_notifications": {
            "type": "boolean"
          },
          "query_recovery": {
            "type": "string",
            "enum": [
              "unsupported",
              "bound_session",
              "saved_order"
            ]
          },
          "refunds": {
            "type": "boolean"
          }
        }
      }
    }
  }
}
```

HTTP 401: Authentication required

HTTP 403: Installation administrator required

## Create or recover a company prepaid top-up

`POST /admin/v1/organizations/{organization}/billing/topups`

Organization-wide owner/admin with write access or installation administrator only. Requires an enabled method and an existing account in the selected integration's currency. Classic EPay and native Zhifux use CNY; Stripe uses its configured supported currency. Exact positive amounts must match the integration's minor-unit precision. No implicit account creation, FX or approved credit. Reuse the same idempotency key and identical intent after an uncertain response. Remote creation is durably claimed before contact and never automatically repeated; EPay saves a deterministic signed checkout locally. Checkout alone grants no balance. Independently verified payment gates funding. Merchant credentials and enabled methods are deployment configuration. An explicit payment_gateway never falls through to another integration. Omission preserves runtime priority for compatibility.

Implementation: `implemented`. Operation: `createCustomerTopup`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Request body

Required.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "amount_nanos",
    "payment_method",
    "idempotency_key"
  ],
  "properties": {
    "currency": {
      "type": "string",
      "pattern": "^[A-Z]{3}$",
      "description": "Optional account currency. Selects a matching enabled integration; omission preserves existing default priority. Never implies conversion."
    },
    "payment_gateway": {
      "type": "string",
      "enum": [
        "epay",
        "stripe",
        "zhifux"
      ],
      "description": "Optional explicit integration. Never falls through to a different gateway; omission preserves default priority."
    },
    "amount_nanos": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Exact positive account-currency nanounits, at most 9223372036854775807. CNY requires divisibility by 10000000; other currencies require their supported minor-unit precision. Never a JSON number."
    },
    "payment_method": {
      "type": "string",
      "minLength": 1,
      "maxLength": 64,
      "pattern": "^[A-Za-z0-9.-]+$",
      "description": "Must be enabled for the configured merchant."
    },
    "idempotency_key": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

### Responses

HTTP 200: Saved top-up status; checkout and pending status confer no spending capacity

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
      "additionalProperties": false,
      "required": [
        "id",
        "currency",
        "amount_nanos",
        "payment_method",
        "status",
        "checkout_url"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid",
          "description": "Internal API routing reference; never display as a product label."
        },
        "currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$",
          "description": "Immutable saved account currency; no implicit conversion."
        },
        "amount_nanos": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "payment_method": {
          "type": "string"
        },
        "status": {
          "type": "string",
          "enum": [
            "reconciliation_required",
            "pending",
            "paid",
            "closed"
          ]
        },
        "checkout_url": {
          "type": [
            "string",
            "null"
          ],
          "format": "uri",
          "description": "Validated HTTPS checkout for pending orders only; null for paid and closed orders."
        }
      }
    }
  }
}
```

HTTP 400: Invalid amount or unavailable payment method

HTTP 401: Authentication required

HTTP 403: Write permission required

HTTP 404: Company billing access not granted

HTTP 409: Missing currency account or conflicting saved intent

HTTP 422: Invalid body schema or unexpected field

HTTP 502: Integration unavailable or checkout creation uncertain; preserve the intent and idempotency key

HTTP 503: Durable storage unavailable; no successful creation is implied

## Recover company checkout history

`GET /admin/v1/organizations/{organization}/billing/topups`

Organization-wide owner/admin with read access or installation administrator only. Backend-owned history survives browser changes. At most 100 saved intents per page, ordered by descending creation time and internal routing reference. No upstream calls, merchant credentials or procurement data. Paid/closed entries withhold checkout URLs. Traversal is a live view, not a fixed snapshot; refresh to see newly created orders. Internal IDs are routing/cursor references, never product labels.

Implementation: `implemented`. Operation: `listCustomerTopups`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`before` (query, optional)

next_cursor from the previous company page. Foreign or missing cursors return conflict.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Saved checkout history page

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_cursor"
  ],
  "properties": {
    "next_cursor": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    },
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "currency",
          "amount_nanos",
          "payment_method",
          "status",
          "checkout_url",
          "created_at"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "description": "Internal routing/cursor reference; never display as a product label."
          },
          "currency": {
            "type": "string",
            "pattern": "^[A-Z]{3}$"
          },
          "amount_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "payment_method": {
            "type": "string"
          },
          "status": {
            "type": "string",
            "enum": [
              "reconciliation_required",
              "pending",
              "paid",
              "closed"
            ]
          },
          "checkout_url": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          }
        }
      }
    }
  }
}
```

HTTP 400: Invalid company or cursor syntax

HTTP 401: Authentication required

HTTP 404: Company billing access not granted

HTTP 409: Foreign or missing cursor

HTTP 503: Durable storage unavailable

## Read company checkout availability

`GET /admin/v1/organizations/{organization}/billing/payment-methods`

Organization-wide owner/admin with read access or installation administrator only. Returns enabled merchant method codes for the requested currency when configured and an account exists. Omitted currency preserves the configured default. No merchant credentials, account identifiers or upstream queries. Availability does not guarantee collection or grant write permission. No FX or account provisioning is implied.

Implementation: `implemented`. Operation: `getCustomerPaymentMethods`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`currency` (query, optional)

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
}
```

`payment_gateway` (query, optional)

Select one configured integration without falling through to another.

```json
{
  "type": "string",
  "enum": [
    "epay",
    "stripe",
    "zhifux"
  ]
}
```

### Responses

HTTP 200: Configured checkout methods or explicit unavailable state

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
      "additionalProperties": false,
      "required": [
        "currency",
        "payment_gateway",
        "available",
        "payment_methods",
        "unavailable_reason"
      ],
      "properties": {
        "currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$"
        },
        "available": {
          "type": "boolean"
        },
        "payment_methods": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Empty when unavailable; exact configured codes otherwise."
        },
        "payment_gateway": {
          "type": [
            "string",
            "null"
          ],
          "enum": [
            "epay",
            "stripe",
            "zhifux",
            null
          ],
          "description": "Selected configured integration for these methods. Forward this value with currency when creating a top-up; null means no matching integration. This is adapter identity, not merchant credentials or a payment-method display label."
        },
        "unavailable_reason": {
          "type": [
            "string",
            "null"
          ],
          "enum": [
            "integration_unavailable",
            "currency_account_missing",
            null
          ]
        }
      }
    }
  }
}
```

HTTP 400: Invalid company identifier or currency query

HTTP 401: Authentication required

HTTP 404: Company billing access not granted

HTTP 503: Durable account storage unavailable

## Read saved company top-up status

`GET /admin/v1/organizations/{organization}/billing/topups/{order}`

Organization-wide owner/admin with read access or installation administrator only. Reads durable records without querying the payment service. Paid and closed orders withhold checkout URLs. Internal routing references must not become product labels. No merchant, platform receipt, ledger identity, Supplier cost or margin is returned.

Implementation: `implemented`. Operation: `getCustomerTopup`.

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`order` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Saved top-up status; checkout and pending status confer no spending capacity

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
      "additionalProperties": false,
      "required": [
        "id",
        "currency",
        "amount_nanos",
        "payment_method",
        "status",
        "checkout_url"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid",
          "description": "Internal API routing reference; never display as a product label."
        },
        "currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$",
          "description": "Immutable saved account currency; no implicit conversion."
        },
        "amount_nanos": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "payment_method": {
          "type": "string"
        },
        "status": {
          "type": "string",
          "enum": [
            "reconciliation_required",
            "pending",
            "paid",
            "closed"
          ]
        },
        "checkout_url": {
          "type": [
            "string",
            "null"
          ],
          "format": "uri",
          "description": "Validated HTTPS checkout for pending orders only; null for paid and closed orders."
        }
      }
    }
  }
}
```

HTTP 400: Invalid route identifier

HTTP 401: Authentication required

HTTP 404: Order missing or company billing access not granted

HTTP 503: Durable storage unavailable

## Read platform payment configuration presence

`GET /admin/v1/platform/configuration`

Requires platform management permission. Returns configuration-presence flags without merchant credentials. EPay is configured when a saved configuration exists (including disabled configurations) or deployment configuration is present; Zhifux and Stripe reflect loaded runtime adapters. Use customer payment-method discovery for checkout availability and the integration inventory for supported capabilities. This response does not prove successful external payments.

Implementation: `implemented`. Operation: `getPlatformConfiguration`.

### Responses

HTTP 200: Sanitized configuration presence

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
        "payment_gateways"
      ],
      "properties": {
        "payment_gateways": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "name",
              "configured"
            ],
            "properties": {
              "name": {
                "type": "string",
                "enum": [
                  "Zhifux",
                  "EPay",
                  "Stripe"
                ]
              },
              "configured": {
                "type": "boolean",
                "description": "Configuration presence only; not enabled checkout, merchant eligibility, or payment qualification."
              }
            }
          }
        }
      }
    }
  }
}
```

HTTP 401: Authentication required

HTTP 403: Platform management permission required

HTTP 503: Configuration storage unavailable

## Shared schemas

Local `#/components/schemas/…` references resolve to these definitions.

### EPayConfiguration

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "merchant_id",
    "endpoint",
    "notify_url",
    "return_url",
    "revision",
    "enabled",
    "has_key",
    "methods"
  ],
  "properties": {
    "merchant_id": {
      "type": "string"
    },
    "endpoint": {
      "type": "string"
    },
    "notify_url": {
      "type": "string"
    },
    "return_url": {
      "type": "string"
    },
    "revision": {
      "type": "string",
      "pattern": "^[0-9]+$"
    },
    "enabled": {
      "type": "boolean"
    },
    "has_key": {
      "type": "boolean"
    },
    "methods": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Saved methods or deployment defaults; legacy disabled configurations may contain unsupported values. Writes accept only alipay and wxpay."
    }
  }
}
```

### GatewayRequestMetadata

```json
{
  "type": "object",
  "required": [
    "attempt_id",
    "operation_id",
    "api_key_id",
    "key_name",
    "task_id",
    "provider_model",
    "output_guardrail_outcome",
    "customer_charge_currency",
    "task_evidence",
    "request_kind",
    "model",
    "created_at",
    "execution",
    "usage_confidence",
    "customer_charge_status",
    "dispatched_at",
    "completed_at",
    "duration_ms",
    "prompt_tokens",
    "completion_tokens",
    "cached_input_tokens",
    "reasoning_output_tokens",
    "customer_charge_nanos",
    "timing",
    "failure",
    "finish_reasons"
  ],
  "properties": {
    "attempt_id": {
      "type": "string",
      "format": "uuid"
    },
    "operation_id": {
      "type": "string",
      "format": "uuid"
    },
    "api_key_id": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    },
    "key_name": {
      "type": [
        "string",
        "null"
      ]
    },
    "task_id": {
      "type": [
        "string",
        "null"
      ]
    },
    "provider_model": {
      "type": [
        "string",
        "null"
      ]
    },
    "output_guardrail_outcome": {
      "type": [
        "string",
        "null"
      ]
    },
    "customer_charge_currency": {
      "type": [
        "string",
        "null"
      ]
    },
    "task_evidence": {
      "description": "Legacy optional correlation metadata; not request content or a complete agent trace."
    },
    "request_kind": {
      "type": "string"
    },
    "model": {
      "type": "string"
    },
    "created_at": {
      "type": "string"
    },
    "execution": {
      "type": "string"
    },
    "usage_confidence": {
      "type": "string"
    },
    "customer_charge_status": {
      "type": "string"
    },
    "dispatched_at": {
      "type": [
        "string",
        "null"
      ],
      "format": "date-time"
    },
    "completed_at": {
      "type": [
        "string",
        "null"
      ],
      "format": "date-time"
    },
    "duration_ms": {
      "type": [
        "integer",
        "null"
      ],
      "description": "Legacy dispatch-to-completion interval, not complete gateway latency."
    },
    "prompt_tokens": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$"
    },
    "completion_tokens": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$"
    },
    "cached_input_tokens": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$"
    },
    "reasoning_output_tokens": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$"
    },
    "customer_charge_nanos": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$",
      "description": "Customer retail charge only. Null is unknown or absent, never an upstream expense fallback."
    },
    "timing": {
      "type": [
        "object",
        "null"
      ],
      "required": [
        "dispatch_ms",
        "headers_ms",
        "first_output_ms",
        "http_status",
        "total_ms",
        "complete"
      ],
      "properties": {
        "dispatch_ms": {
          "type": [
            "integer",
            "null"
          ]
        },
        "headers_ms": {
          "type": [
            "integer",
            "null"
          ]
        },
        "first_output_ms": {
          "type": [
            "integer",
            "null"
          ]
        },
        "http_status": {
          "type": [
            "integer",
            "null"
          ]
        },
        "total_ms": {
          "type": "integer"
        },
        "complete": {
          "type": "boolean"
        }
      }
    },
    "failure": {
      "type": [
        "object",
        "null"
      ],
      "required": [
        "kind",
        "upstream_http_status"
      ],
      "properties": {
        "kind": {
          "type": "string"
        },
        "upstream_http_status": {
          "type": [
            "integer",
            "null"
          ]
        }
      }
    },
    "finish_reasons": {
      "type": [
        "array",
        "null"
      ],
      "items": {
        "type": "object",
        "required": [
          "index",
          "reason"
        ],
        "properties": {
          "index": {
            "type": "integer"
          },
          "reason": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

### KeyConcurrencyConcurrencyLimit

```json
{
  "type": [
    "integer",
    "null"
  ],
  "minimum": 0,
  "maximum": 10000,
  "description": "Maximum unresolved dispatched requests; null is unlimited and zero denies dispatch."
}
```

### KeyConcurrencyPolicy

```json
{
  "type": "object",
  "required": [
    "max_concurrent_requests",
    "revision",
    "active_requests"
  ],
  "properties": {
    "max_concurrent_requests": {
      "$ref": "#/components/schemas/KeyConcurrencyConcurrencyLimit"
    },
    "revision": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[1-9][0-9]*$"
    },
    "active_requests": {
      "type": "integer",
      "minimum": 0,
      "description": "Current unresolved dispatch count shared across rotations; includes work admitted before configuration."
    }
  }
}
```

### KeyRequestRatePolicy

```json
{
  "type": "object",
  "required": [
    "requests_per_minute",
    "revision"
  ],
  "properties": {
    "requests_per_minute": {
      "$ref": "#/components/schemas/KeyRequestRateRequestLimit"
    },
    "revision": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[1-9][0-9]*$"
    }
  }
}
```

### KeyRequestRateRequestLimit

```json
{
  "type": [
    "integer",
    "null"
  ],
  "minimum": 0,
  "maximum": 1000000,
  "description": "Maximum dispatches per rolling 60 seconds; null is unlimited and zero denies dispatch."
}
```

### KeyTokenRatePolicy

```json
{
  "type": "object",
  "required": [
    "tokens_per_minute",
    "revision",
    "snapshot_at",
    "known_tokens",
    "reserved_tokens",
    "unbounded_requests",
    "committed_tokens"
  ],
  "properties": {
    "tokens_per_minute": {
      "$ref": "#/components/schemas/KeyTokenRateTokenRateLimit"
    },
    "revision": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[1-9][0-9]*$"
    },
    "snapshot_at": {
      "type": "string",
      "format": "date-time"
    },
    "known_tokens": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Known provider usage completed within 60 seconds."
    },
    "reserved_tokens": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Estimates retained for unresolved usage, without time-based expiry."
    },
    "unbounded_requests": {
      "type": "integer",
      "minimum": 0,
      "description": "Unknown dispatched requests without a saved bound."
    },
    "committed_tokens": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$",
      "description": "Known plus reserved tokens, or null when unbounded requests prevent a complete total."
    }
  }
}
```

### KeyTokenRateTokenRateLimit

```json
{
  "type": [
    "integer",
    "null"
  ],
  "minimum": 0,
  "maximum": 1000000000000,
  "description": "Token budget includes unresolved reservations plus provider-reported usage completed in the last 60 seconds. Null is unlimited; zero denies dispatch."
}
```

### WorkspaceSpendingHistory

```json
{
  "type": "object",
  "required": [
    "currency",
    "revision",
    "limit_nanos",
    "recorded_at",
    "source",
    "actor_kind",
    "actor_name"
  ],
  "properties": {
    "currency": {
      "type": "string"
    },
    "revision": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Exact nonnegative decimal integer, within signed 64-bit range."
    },
    "limit_nanos": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Exact nonnegative decimal integer, within signed 64-bit range."
    },
    "recorded_at": {
      "type": [
        "string",
        "null"
      ],
      "format": "date-time"
    },
    "source": {
      "type": "string"
    },
    "actor_kind": {
      "type": [
        "string",
        "null"
      ]
    },
    "actor_name": {
      "type": [
        "string",
        "null"
      ]
    }
  }
}
```

### WorkspaceSpendingInput

```json
{
  "type": "object",
  "required": [
    "limit_nanos",
    "expected_revision"
  ],
  "properties": {
    "limit_nanos": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Exact nonnegative decimal integer, within signed 64-bit range."
    },
    "expected_revision": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Exact nonnegative decimal integer, within signed 64-bit range."
    }
  },
  "additionalProperties": false
}
```

### WorkspaceSpendingSummary

```json
{
  "type": "object",
  "required": [
    "currency",
    "limit_nanos",
    "revision",
    "committed_nanos"
  ],
  "properties": {
    "currency": {
      "type": "string",
      "pattern": "^[A-Z]{3}$"
    },
    "limit_nanos": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$",
      "description": "Exact nonnegative decimal integer, within signed 64-bit range."
    },
    "revision": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$",
      "description": "Exact nonnegative decimal integer, within signed 64-bit range."
    },
    "committed_nanos": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Exact nonnegative decimal integer, within signed 64-bit range."
    }
  }
}
```
