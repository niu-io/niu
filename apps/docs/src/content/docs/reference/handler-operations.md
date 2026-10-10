---
title: Implemented API operations
description: Handler-generated parameters, request bodies, responses and schemas.
---

Generated from backend handler annotations. Do not edit directly.

This is the annotated subset, not the complete API. See the [API overview](/docs/reference/api/) and [root OpenAPI contract](https://github.com/niu-io/niu/blob/main/contracts/openapi.yaml) for the broader interface.

[Download the annotated OpenAPI JSON](/docs/openapi/handler-operations.json) for API tooling. It contains only the operations documented on this page.

## Read API key concurrency policy

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/concurrency-limit`

Scoped readers may inspect the policy shared across secret rotations.

Implementation: `implemented`. Operation: `getKeyConcurrencyLimit`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

## Get or create the installation default workspace

`POST /admin/v1/setup/default-workspace`

Installation credential only. First use atomically creates company/workspace ownership and a zero-funded USD balance account with zero approved credit. Repeated and concurrent calls reuse the designated default. Existing defaults retain their billing configuration. Development login uses the same first-use initializer. No API key, payment receipt or spending capacity is created. No request body is required. The legacy project_id field identifies the workspace; these identifiers are routing references, not display labels.

Implementation: `implemented`. Operation: `getOrCreateDefaultWorkspace`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Responses

HTTP 200: Stable default ownership references, without a data wrapper.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "organization_id",
    "project_id"
  ],
  "additionalProperties": false,
  "properties": {
    "organization_id": {
      "type": "string",
      "format": "uuid"
    },
    "project_id": {
      "type": "string",
      "format": "uuid",
      "description": "Workspace routing identifier."
    }
  }
}
```

HTTP 401: Missing, invalid, expired or inference-only credential.

HTTP 403: Authenticated member lacks installation authority, including a platform administrator.

## Rename a workspace

`PATCH /admin/v1/organizations/{organization}/projects/{project}`

Requires scoped workspace write access. Trims the saved name. Returns the existing workspace identity and new name; no optimistic revision is accepted.

Implementation: `implemented`. Operation: `renameWorkspace`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Request body

Required.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "name"
  ],
  "properties": {
    "name": {
      "type": "string",
      "description": "Must contain non-whitespace text and be at most 200 UTF-8 bytes before trimming."
    }
  }
}
```

### Responses

HTTP 200: Saved workspace name

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "id",
    "name"
  ],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "name": {
      "type": "string"
    }
  }
}
```

HTTP 400: Invalid name or identifier

HTTP 401: Authentication required

HTTP 403: Write permission required

HTTP 404: Workspace missing or outside authorized scope

HTTP 422: Invalid body shape

HTTP 503: Storage unavailable

## Delete an empty workspace

`DELETE /admin/v1/organizations/{organization}/projects/{project}`

Requires installation authority or company-level membership with member-management permission. Workspace-scoped members cannot delete a workspace. Referenced workspaces are protected by storage foreign keys and return 409; no cascade deletion of business history is requested.

Implementation: `implemented`. Operation: `deleteWorkspace`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

HTTP 204: Workspace deleted; empty body

HTTP 400: Invalid identifier

HTTP 401: Authentication required

HTTP 403: Required company-level management permission missing

HTTP 404: Workspace missing or outside authorized scope

HTTP 409: Workspace still has dependent records

HTTP 503: Storage unavailable

## Issue a workspace API key and return its secret once

`POST /admin/v1/organizations/{organization}/projects/{project}/keys`

Requires workspace write access. Workspace API keys do not authorize these management operations. Grants must be visible model aliases, or the wildcard * as the sole grant. The token is returned only in this response.

Implementation: `implemented`. Operation: `issueKey`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Request body

Required.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/KeyInput"
}
```

### Responses

HTTP 201: Issued key identity and one-time secret.

Response header: `Cache-Control`.

Secrets must not be cached.

```json
{
  "type": "string",
  "const": "no-store"
}
```

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/IssuedWorkspaceKey"
}
```

HTTP 401: Invalid or expired administrative credential.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ApiErrorResponse"
}
```

HTTP 404: Workspace outside authorized scope.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ApiErrorResponse"
}
```

HTTP 403: Workspace write permission required.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ApiErrorResponse"
}
```

HTTP 400: Invalid fields, model grants, name or lifetime.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ApiErrorResponse"
}
```

Content type: `text/plain`.

```json
{
  "type": "string",
  "description": "Framework path or JSON syntax rejection may use a plain-text body instead of the application error envelope."
}
```

## Revoke a workspace API key

`DELETE /admin/v1/organizations/{organization}/projects/{project}/keys/{key}`

Requires workspace write access. Workspace API keys do not authorize these management operations.

Implementation: `implemented`. Operation: `revokeKey`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

HTTP 204: Key revoked, including an already revoked key.

HTTP 401: Invalid or expired administrative credential.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ApiErrorResponse"
}
```

HTTP 409: Key does not exist in this project.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ApiErrorResponse"
}
```

HTTP 404: Workspace outside authorized scope.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ApiErrorResponse"
}
```

HTTP 403: Workspace write permission required.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ApiErrorResponse"
}
```

## Update workspace API key name and model grants

`PATCH /admin/v1/organizations/{organization}/projects/{project}/keys/{key}`

Requires workspace write access. Changes the saved name and model grants without returning or rotating the secret or extending expiry. Subsequent requests use the current grants; this does not cancel already dispatched requests. expected_revision is an integer, unlike decimal-string policy revisions. A no-op edit retains its revision; a changed edit increments it. Model aliases must exist in the authorized scope. The wildcard must be the sole grant.

Implementation: `implemented`. Operation: `updateKeyMetadata`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ApiErrorResponse"
}
```

Content type: `text/plain`.

```json
{
  "type": "string",
  "description": "Framework path or JSON syntax rejection may use a plain-text body instead of the application error envelope."
}
```

HTTP 401: Authentication required

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ApiErrorResponse"
}
```

HTTP 403: Write permission required

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ApiErrorResponse"
}
```

HTTP 404: Workspace access not granted

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ApiErrorResponse"
}
```

HTTP 409: Stale revision, missing key, revoked key or expired key

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ApiErrorResponse"
}
```

HTTP 422: Invalid JSON shape, missing or unknown fields

HTTP 503: Durable storage unavailable

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ApiErrorResponse"
}
```

## List workspace API-key metadata (up to 1000 records)

`GET /admin/v1/organizations/{organization}/projects/{project}/keys`

Requires workspace read access. Workspace API keys do not authorize these management operations.

Implementation: `implemented`. Operation: `listKeys`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

HTTP 200: Scoped metadata, never token hashes or secrets. Last used is the latest durable dispatch intent, including uncertain attempts; it is not authentication time or proof of upstream completion.

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
      "maxItems": 1000,
      "items": {
        "$ref": "#/components/schemas/WorkspaceKey"
      }
    }
  }
}
```

HTTP 401: Invalid or expired administrative credential.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ApiErrorResponse"
}
```

HTTP 404: Workspace outside authorized scope.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ApiErrorResponse"
}
```

## Atomically replace a key while preserving its grants and expiry

`POST /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/rotate`

Requires workspace write access. Workspace API keys do not authorize these management operations. Revokes the old secret atomically. The replacement preserves grants, expiry, spending identity and configured key policies; rotation does not reset consumed allowance.

Implementation: `implemented`. Operation: `rotateKey`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

HTTP 201: Issued key identity and one-time secret.

Response header: `Cache-Control`.

Secrets must not be cached.

```json
{
  "type": "string",
  "const": "no-store"
}
```

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/IssuedWorkspaceKey"
}
```

HTTP 401: Invalid or expired administrative credential.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ApiErrorResponse"
}
```

HTTP 409: Key is absent, revoked, expired or concurrently rotated.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ApiErrorResponse"
}
```

HTTP 404: Workspace outside authorized scope.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ApiErrorResponse"
}
```

HTTP 403: Workspace write permission required.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ApiErrorResponse"
}
```

## Read a recorded gateway request

`GET /admin/v1/organizations/{organization}/projects/{project}/requests/{attempt}`

Scoped workspace read access required. Returns persisted metadata, usage, timing, safe failure classification and customer charges without prompts, response bodies or Supplier procurement costs. Missing or foreign attempts return 404. Unknown values remain null. Legacy correlation fields are opaque metadata. Does not contact the upstream service or change billing.

Implementation: `implemented`. Operation: `getGatewayRequest`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

Response header: `Cache-Control`.

```json
{
  "type": "string",
  "const": "no-store"
}
```

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

## Read automatically retained gateway request activity

`GET /admin/v1/organizations/{organization}/projects/{project}/requests`

Returns metadata for model attempts admitted by Niu, newest first by default, with the requested sort applied to the whole range. Request and response bodies, prompts and completions are not included. Pages are bounded to at most 100 entries. Pass the previous response's next_cursor as after to read older matching entries; traversal is a live view, not a cross-page snapshot. Optional filters apply to the whole workspace scope. summary totals cover the selected filters independent of page. An absent task_id means the caller did not supply X-Niu-Task-ID. Missing usage remains unknown. All workspace responses exclude Supplier expenses and platform margins, including for installation administrators. Customer-facing charges and nullable observed request phase timing are included.

Implementation: `implemented`. Operation: `listProjectGatewayActivity`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Parameters

`http_status` (query, optional)

Recorded delivery HTTP status, or unknown when absent; independent of Provider execution.

```json
{
  "type": "string",
  "pattern": "^(unknown|[1-5][0-9]{2})$"
}
```

`sort` (query, optional)

Full-range order. Known latency/token values precede unknown values; time and ID break ties. Live traversal is not a cross-page snapshot.

```json
{
  "type": "string",
  "enum": [
    "time_desc",
    "time_asc",
    "latency_desc",
    "input_desc",
    "output_desc"
  ],
  "default": "time_desc"
}
```

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

`after` (query, optional)

Exclusive cursor from the previous page's next_cursor; continue strictly after this attempt in the same sort order; preserve sort and filters across pages.

```json
{
  "type": "string",
  "format": "uuid"
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

`from_ms` (query, optional)

Inclusive creation-time lower bound as Unix epoch milliseconds.

```json
{
  "type": "integer",
  "format": "int64"
}
```

`to_ms` (query, optional)

Exclusive creation-time upper bound as Unix epoch milliseconds.

```json
{
  "type": "integer",
  "format": "int64"
}
```

`model_alias` (query, optional)

Exact public model alias filter.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 200
}
```

`operation_id` (query, optional)

Restrict attempts and summaries to one operation within the authorized workspace. Unknown or foreign operations yield an empty result; this does not authorize cross-workspace reads.

```json
{
  "type": "string",
  "format": "uuid"
}
```

`key_id` (query, optional)

Workspace API key ID filter. Key names and IDs are visible only within the authorized workspace.

```json
{
  "type": "string",
  "format": "uuid"
}
```

`status` (query, optional)

Exact gateway execution state, or output_withheld for recorded blocked/indeterminate output inspection. delivery_failed selects recorded HTTP errors (400–599). Completion at the Provider does not establish successful response delivery.

```json
{
  "type": "string",
  "enum": [
    "not_sent",
    "may_have_executed",
    "confirmed_completed",
    "confirmed_not_executed",
    "output_withheld",
    "delivery_failed"
  ]
}
```

### Responses

HTTP 200: Gateway activity wrapped in data, nullable next_cursor, and summary. Each entry includes attempt_id, operation_id, optional project api_key_id/key_name and task_id, an optional summary of the latest supplemental execution record for that task, public model alias and nullable provider-reported model, creation/dispatch/completion times, duration_ms, execution status, usage confidence, nullable prompt/completion token counts, and nullable customer charge currency/amount/status and request phase timing. Integer quantities and amounts are decimal strings. Pages follow the requested sort; next_cursor is the last attempt_id when further matching entries remain. summary covers all rows matching the filters, not only the current page.

Response header: `Cache-Control`.

Request diagnostics must not be cached.

```json
{
  "type": "string",
  "const": "no-store"
}
```

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_cursor",
    "summary"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/GatewayActivity"
      }
    },
    "next_cursor": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    },
    "summary": {
      "type": "object",
      "required": [
        "request_count",
        "usage_count",
        "prompt_tokens",
        "completion_tokens",
        "timing_count",
        "average_duration_ms"
      ],
      "properties": {
        "request_count": {
          "type": "integer",
          "format": "int64"
        },
        "usage_count": {
          "type": "integer",
          "format": "int64"
        },
        "prompt_tokens": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "completion_tokens": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "timing_count": {
          "type": "integer",
          "format": "int64"
        },
        "average_duration_ms": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 0,
          "description": "Rounded mean of completed gateway request totals over all matching requests. Interrupted phase measurements are excluded. Historical rows without phase timing are excluded because their dispatch interval uses a different boundary. No eligible samples returns null."
        },
        "unresolved_customer_charge_count": {
          "type": "integer",
          "minimum": 0
        },
        "unpriced_request_count": {
          "type": "integer",
          "minimum": 0
        },
        "owner_funded_request_count": {
          "type": "integer",
          "minimum": 0,
          "description": "Dispatched requests using the account owner\u2019s API credential without a Niu customer debit."
        },
        "delivery_statuses": {
          "type": "array",
          "description": "Counts by recorded delivery HTTP status across all matching requests in the summary snapshot. Null means unknown, not successful or failed.",
          "items": {
            "type": "object",
            "required": [
              "http_status",
              "request_count"
            ],
            "properties": {
              "http_status": {
                "type": [
                  "integer",
                  "null"
                ],
                "minimum": 100,
                "maximum": 599
              },
              "request_count": {
                "type": "integer",
                "minimum": 0
              }
            }
          }
        },
        "customer_charges": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "currency",
              "amount_nanos",
              "charged_requests"
            ],
            "properties": {
              "currency": {
                "type": "string",
                "pattern": "^[A-Z]{3}$"
              },
              "amount_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "charged_requests": {
                "type": "integer",
                "minimum": 0
              }
            }
          }
        },
        "usage_by_model": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "model_alias",
              "request_count",
              "usage_count",
              "prompt_tokens",
              "completion_tokens",
              "unknown_usage_count"
            ],
            "properties": {
              "model_alias": {
                "type": "string"
              },
              "request_count": {
                "type": "integer",
                "minimum": 0
              },
              "usage_count": {
                "type": "integer",
                "minimum": 0
              },
              "prompt_tokens": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "completion_tokens": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "unknown_usage_count": {
                "type": "integer",
                "minimum": 0
              }
            }
          }
        },
        "charges_by_model": {
          "type": "array",
          "items": {
            "allOf": [
              {
                "type": "object",
                "description": "Full-range customer ledger totals grouped separately by currency; missing amounts stay null. Coverage counts partition each row's requests. Supplier expenses are excluded.",
                "required": [
                  "currency",
                  "amount_nanos",
                  "request_count",
                  "charged_requests",
                  "unresolved_requests",
                  "unpriced_requests",
                  "not_charged_requests"
                ],
                "properties": {
                  "currency": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^[A-Z]{3}$"
                  },
                  "amount_nanos": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^[0-9]+$"
                  },
                  "request_count": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "charged_requests": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "unresolved_requests": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "unpriced_requests": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "not_charged_requests": {
                    "type": "integer",
                    "minimum": 0
                  }
                }
              },
              {
                "type": "object",
                "required": [
                  "model_alias"
                ],
                "properties": {
                  "model_alias": {
                    "type": "string"
                  }
                }
              }
            ]
          }
        },
        "charges_by_key": {
          "type": "array",
          "items": {
            "allOf": [
              {
                "type": "object",
                "description": "Full-range customer ledger totals grouped separately by currency; missing amounts stay null. Coverage counts partition each row's requests. Supplier expenses are excluded.",
                "required": [
                  "currency",
                  "amount_nanos",
                  "request_count",
                  "charged_requests",
                  "unresolved_requests",
                  "unpriced_requests",
                  "not_charged_requests"
                ],
                "properties": {
                  "currency": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^[A-Z]{3}$"
                  },
                  "amount_nanos": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^[0-9]+$"
                  },
                  "request_count": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "charged_requests": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "unresolved_requests": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "unpriced_requests": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "not_charged_requests": {
                    "type": "integer",
                    "minimum": 0
                  }
                }
              },
              {
                "type": "object",
                "required": [
                  "api_key_id",
                  "key_name"
                ],
                "properties": {
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
                  }
                }
              }
            ]
          }
        },
        "usage_by_key": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "api_key_id",
              "key_name",
              "request_count",
              "usage_count",
              "prompt_tokens",
              "completion_tokens",
              "unknown_usage_count"
            ],
            "properties": {
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
              "request_count": {
                "type": "integer",
                "minimum": 0
              },
              "usage_count": {
                "type": "integer",
                "minimum": 0
              },
              "prompt_tokens": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "completion_tokens": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "unknown_usage_count": {
                "type": "integer",
                "minimum": 0
              }
            }
          }
        },
        "latency_percentiles": {
          "type": "object",
          "description": "Discrete percentiles of completed gateway body-consumption durations across the filtered range, independent of pagination. Incomplete or missing measurements are excluded. This is not client receipt time or upstream-only generation time.",
          "required": [
            "boundary",
            "sample_count",
            "p50_ms",
            "p95_ms",
            "p99_ms"
          ],
          "properties": {
            "boundary": {
              "type": "string",
              "const": "gateway_body_ms"
            },
            "sample_count": {
              "type": "integer",
              "minimum": 0
            },
            "p50_ms": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 0
            },
            "p95_ms": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 0
            },
            "p99_ms": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 0
            }
          }
        },
        "token_categories": {
          "type": "object",
          "description": "Explicitly reported token subsets over the full filtered snapshot. Sums cover reported requests only; null means no observations. Missing category data is never inferred as zero, and no category-specific billing rate is implied.",
          "required": [
            "cached_input_tokens",
            "cached_input_requests",
            "cached_input_unknown_requests",
            "reasoning_output_tokens",
            "reasoning_output_requests",
            "reasoning_output_unknown_requests"
          ],
          "properties": {
            "cached_input_tokens": {
              "type": [
                "string",
                "null"
              ],
              "pattern": "^[0-9]+$"
            },
            "cached_input_requests": {
              "type": "integer",
              "minimum": 0
            },
            "cached_input_unknown_requests": {
              "type": "integer",
              "minimum": 0
            },
            "reasoning_output_tokens": {
              "type": [
                "string",
                "null"
              ],
              "pattern": "^[0-9]+$"
            },
            "reasoning_output_requests": {
              "type": "integer",
              "minimum": 0
            },
            "reasoning_output_unknown_requests": {
              "type": "integer",
              "minimum": 0
            }
          }
        },
        "request_histogram": {
          "type": "array",
          "maxItems": 24,
          "description": "Nonempty time buckets over all filtered requests, independent of pagination. Buckets and other summary aggregates share one database snapshot. Empty ranges return an empty array.",
          "items": {
            "type": "object",
            "required": [
              "start_ms",
              "end_ms",
              "request_count"
            ],
            "properties": {
              "start_ms": {
                "type": "integer"
              },
              "end_ms": {
                "type": "integer"
              },
              "request_count": {
                "type": "integer",
                "minimum": 1
              }
            }
          }
        }
      }
    }
  }
}
```

HTTP 401: Administrator authentication required.

HTTP 400: Invalid path or query parameter.

## Read workspace customer charges, tariffs and latest 100 invoices

`GET /admin/v1/organizations/{organization}/projects/{project}/billing`

Requires workspace read access. Balances cover the full ledger per currency. All monetary amounts and aggregate counts are decimal integer strings. Upstream costs are separate. Cache-Control is no-store.

Implementation: `implemented`. Operation: `getCustomerBilling`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

HTTP 200: Billing overview

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
        "balances",
        "unresolved",
        "unpriced",
        "tariffs",
        "invoices"
      ],
      "properties": {
        "balances": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "currency",
              "charged_nanos",
              "unbilled_nanos",
              "due_nanos",
              "paid_nanos"
            ],
            "properties": {
              "currency": {
                "type": "string"
              },
              "charged_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "unbilled_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "due_nanos": {
                "allOf": [
                  {
                    "type": "string",
                    "pattern": "^[0-9]+$"
                  }
                ],
                "description": "Invoiced charges without an invoice receipt or matching balance debit."
              },
              "paid_nanos": {
                "allOf": [
                  {
                    "type": "string",
                    "pattern": "^[0-9]+$"
                  }
                ],
                "description": "Charges settled by a balance debit or invoice receipt, counted once, including balance debits before invoicing."
              }
            }
          }
        },
        "unresolved": {
          "allOf": [
            {
              "type": "string",
              "pattern": "^[0-9]+$"
            }
          ],
          "description": "Dispatched non-personal requests with a text or media price binding but no corresponding charge; excludes confirmed nonexecution."
        },
        "unpriced": {
          "allOf": [
            {
              "type": "string",
              "pattern": "^[0-9]+$"
            }
          ],
          "description": "Dispatched non-personal requests without either a text or media price binding; excludes confirmed nonexecution."
        },
        "tariffs": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "model_alias",
              "revision",
              "currency",
              "prompt_rate",
              "completion_rate"
            ],
            "properties": {
              "model_alias": {
                "type": "string"
              },
              "revision": {
                "type": "string",
                "format": "uuid"
              },
              "currency": {
                "type": "string"
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
                "pattern": "^[0-9]+$",
                "description": "Minimum customer charge in currency nanounits (0 to 9223372036854775807), not a token rate. Defaults to zero for new tariffs. Replacing a nonzero minimum requires an explicit value; zero disables it. Known completed usage is charged the greater of the rounded token amount and this minimum. Unknown usage remains unresolved."
              },
              "cached_prompt_rate": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^[0-9]+$"
              }
            }
          }
        },
        "invoices": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "id",
              "from_ms",
              "to_ms",
              "currency",
              "amount_nanos",
              "created_at",
              "status",
              "payment_reference"
            ],
            "properties": {
              "id": {
                "type": "string",
                "format": "uuid"
              },
              "from_ms": {
                "type": "integer",
                "format": "int64"
              },
              "to_ms": {
                "type": "integer",
                "format": "int64"
              },
              "currency": {
                "type": "string"
              },
              "amount_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "created_at": {
                "type": "string",
                "format": "date-time"
              },
              "status": {
                "type": "string",
                "enum": [
                  "issued",
                  "paid"
                ],
                "description": "Paid when an invoice receipt exists or every included charge is settled by a matching balance debit or has zero value. Credit-backed account debt remains separate."
              },
              "payment_reference": {
                "type": [
                  "string",
                  "null"
                ]
              }
            }
          }
        }
      }
    }
  }
}
```

HTTP 401: Invalid or expired credential

HTTP 404: Workspace outside authorized scope

## Publish an immutable customer selling rate revision

`POST /admin/v1/organizations/{organization}/projects/{project}/billing/tariffs`

Installation only. Rates are currency nanounits per million text tokens, bounded at 1000000000000000. Optional cached_prompt_rate independently prices reported cached input. Null selects flat input pricing. When replacing an existing cached tariff this field must be explicit; omission conflicts. Missing cached usage keeps charges unresolved. No retroactive billing. Cache-Control is no-store.

Implementation: `implemented`. Operation: `publishCustomerSellingRate`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Request body

Required.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "model_alias",
    "currency",
    "prompt_rate",
    "completion_rate"
  ],
  "properties": {
    "model_alias": {
      "type": "string",
      "maxLength": 200
    },
    "currency": {
      "type": "string",
      "pattern": "^[A-Z]{3}$"
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
      "pattern": "^[0-9]+$",
      "description": "Minimum customer charge in currency nanounits (0 to 9223372036854775807), not a token rate. Defaults to zero for new tariffs. Replacing a nonzero minimum requires an explicit value; zero disables it. Known completed usage is charged the greater of the rounded token amount and this minimum. Unknown usage remains unresolved."
    },
    "cached_prompt_rate": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$",
      "description": "Optional cache-read rate with the same unit and maximum as prompt_rate."
    },
    "expected_revision": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    }
  }
}
```

### Responses

HTTP 200: Published immutable customer tariff revision

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
          "format": "uuid"
        }
      }
    }
  }
}
```

HTTP 400: Invalid rates, currency or unavailable model alias

HTTP 403: Installation authority required

HTTP 409: Stale expected revision

HTTP 401: Invalid or expired administrative credential.

HTTP 404: Workspace outside authorized scope.

## Issue an immutable itemized usage statement

`POST /admin/v1/organizations/{organization}/projects/{project}/billing/invoices`

Installation only. Half-open UTC dispatch interval [from_ms, to_ms), maximum 366 days, one currency. Includes text and media charges. Rejects unresolved priced usage, unsettled media balance debits, overlapping periods and empty periods. Exact idempotent retries return the same invoice. Does not collect money or calculate tax. Cache-Control is no-store.

Implementation: `implemented`. Operation: `issueCustomerUsageInvoice`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Request body

Required.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "from_ms",
    "to_ms",
    "currency",
    "idempotency_key"
  ],
  "properties": {
    "from_ms": {
      "type": "integer",
      "format": "int64",
      "minimum": 0
    },
    "to_ms": {
      "type": "integer",
      "format": "int64"
    },
    "currency": {
      "type": "string",
      "pattern": "^[A-Z]{3}$"
    },
    "idempotency_key": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

### Responses

HTTP 200: Invoice identity, including an exact idempotent replay

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
        "id"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        }
      }
    }
  }
}
```

HTTP 400: Invalid period or currency

HTTP 403: Installation authority required

HTTP 409: Unresolved usage, overlapping or empty period, or changed idempotency payload

HTTP 401: Invalid or expired administrative credential.

HTTP 404: Workspace outside authorized scope.

## Read invoice lines grouped by model and pinned rate revision

`GET /admin/v1/organizations/{organization}/projects/{project}/billing/invoices/{invoice}`

Requires workspace read access. Returns no entries for an invoice outside that workspace. Cache-Control is no-store. Text quantities and rates are pinned to the charge revision; publishing a new tariff does not reprice historical invoice lines. Supplier expenses are never included.

Implementation: `implemented`. Operation: `getCustomerInvoiceLines`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

`invoice` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`media_after` (query, optional)

Opaque media_next_cursor from the preceding page. Text groups repeat on each page.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Grouped immutable charge entries

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "media_lines",
    "media_next_cursor"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "allOf": [
          {
            "type": "object",
            "required": [
              "model_alias",
              "revision",
              "currency",
              "prompt_rate",
              "completion_rate"
            ],
            "properties": {
              "model_alias": {
                "type": "string"
              },
              "revision": {
                "type": "string",
                "format": "uuid"
              },
              "currency": {
                "type": "string"
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
                "pattern": "^[0-9]+$",
                "description": "Minimum customer charge in currency nanounits (0 to 9223372036854775807), not a token rate. Defaults to zero for new tariffs. Replacing a nonzero minimum requires an explicit value; zero disables it. Known completed usage is charged the greater of the rounded token amount and this minimum. Unknown usage remains unresolved."
              },
              "cached_prompt_rate": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^[0-9]+$"
              }
            }
          },
          {
            "type": "object",
            "required": [
              "requests",
              "prompt_tokens",
              "completion_tokens",
              "amount_nanos"
            ],
            "properties": {
              "requests": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "prompt_tokens": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "completion_tokens": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "cached_prompt_tokens": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^[0-9]+$"
              },
              "minimum_charge_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$",
                "description": "Minimum customer charge in currency nanounits (0 to 9223372036854775807), not a token rate. Defaults to zero for new tariffs. Replacing a nonzero minimum requires an explicit value; zero disables it. Known completed usage is charged the greater of the rounded token amount and this minimum. Unknown usage remains unresolved."
              },
              "cached_prompt_rate": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^[0-9]+$"
              },
              "amount_nanos": {
                "type": "string",
                "pattern": "^[0-9]+$"
              }
            }
          }
        ]
      }
    },
    "media_next_cursor": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid",
      "description": "Pass as media_after for the next page; null when exhausted."
    },
    "media_lines": {
      "type": "array",
      "maxItems": 100,
      "description": "Per-request customer media receipts. Text groups remain in data; both arrays contribute to the invoice total.",
      "items": {
        "type": "object",
        "required": [
          "model_alias",
          "currency",
          "amount_nanos",
          "tariff_revision",
          "meter",
          "measured_quantity",
          "billable_quantity",
          "discount_revisions",
          "bound_exceeded"
        ],
        "properties": {
          "model_alias": {
            "type": "string"
          },
          "currency": {
            "type": "string"
          },
          "amount_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "tariff_revision": {
            "type": "string"
          },
          "meter": {
            "type": "string"
          },
          "measured_quantity": {
            "type": "object",
            "required": [
              "numerator",
              "denominator"
            ],
            "properties": {
              "numerator": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "denominator": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              }
            }
          },
          "billable_quantity": {
            "type": "object",
            "required": [
              "numerator",
              "denominator"
            ],
            "properties": {
              "numerator": {
                "type": "string",
                "pattern": "^[0-9]+$"
              },
              "denominator": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              }
            }
          },
          "discount_revisions": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "bound_exceeded": {
            "type": "boolean"
          }
        }
      }
    }
  }
}
```

HTTP 404: Workspace outside authorized scope

HTTP 401: Invalid or expired administrative credential.

## Read shared company account balances

`GET /admin/v1/organizations/{organization}/billing/balance`

Requires organization-wide owner/admin access or installation administration. Workspace-only sessions and organization viewers cannot read shared funds. Exact nanounit amounts are decimal strings. Available funds equal posted balance plus approved credit minus outstanding liabilities (including known media charges above their original holds); each request must still atomically reserve its full liability. No account identifiers, Supplier prices or payment references are exposed.

Implementation: `implemented`. Operation: `getCustomerBalance`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Customer balance summaries by currency

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
          "balance_nanos",
          "reserved_nanos",
          "outstanding_nanos",
          "available_nanos",
          "credit_limit_nanos",
          "warning_threshold_nanos",
          "policy_revision",
          "low_balance",
          "posted_credit_exhausted"
        ],
        "properties": {
          "currency": {
            "type": "string",
            "pattern": "^[A-Z]{3}$"
          },
          "balance_nanos": {
            "type": "string",
            "pattern": "^-?[0-9]+$"
          },
          "reserved_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "outstanding_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$",
            "description": "Open customer liabilities, including known media charges above their original holds, excluding already posted debits."
          },
          "available_nanos": {
            "type": "string",
            "pattern": "^-?[0-9]+$",
            "description": "Posted balance plus approved credit minus outstanding_nanos; may be negative."
          },
          "credit_limit_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "policy_revision": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "warning_threshold_nanos": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$"
          },
          "low_balance": {
            "type": "boolean"
          },
          "posted_credit_exhausted": {
            "type": "boolean"
          }
        }
      }
    }
  }
}
```

HTTP 401: Authentication required

HTTP 404: Company account access not granted

## Compare customer charge records with prepaid ledger debits

`GET /admin/v1/organizations/{organization}/billing/charge-reconciliation`

Organization-wide owner/admin or installation read access required. One database snapshot compares prepaid-bound text and media charges against original charge entries per currency. Refunds do not reduce original charge matching. Reports counts and exact decimal amounts only, with no internal identifiers or Supplier prices. Zero counts on an empty account do not establish financial readiness. This is read-only and does not verify external payment settlement, recalculate prices, reconcile legacy invoices or repair discrepancies. Pending settlement can appear as a discrepancy; use a later observation to distinguish an in-flight write from a persistent mismatch.

Implementation: `implemented`. Operation: `getCustomerChargeReconciliation`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Per-currency observations

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
          "observed_at",
          "charge_records",
          "expected_charge_nanos",
          "posted_charge_nanos",
          "missing_charge_entries",
          "mismatched_charge_entries",
          "unexpected_charge_entries",
          "duplicate_charge_sources",
          "settled_open_reservations"
        ],
        "properties": {
          "currency": {
            "type": "string",
            "pattern": "^[A-Z]{3}$"
          },
          "observed_at": {
            "type": "string",
            "format": "date-time"
          },
          "charge_records": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "expected_charge_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "posted_charge_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "missing_charge_entries": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "mismatched_charge_entries": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "unexpected_charge_entries": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "duplicate_charge_sources": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "settled_open_reservations": {
            "type": "string",
            "pattern": "^[0-9]+$"
          }
        }
      }
    }
  }
}
```

HTTP 401: Missing or invalid administration credentials

HTTP 404: Company billing scope unavailable to this principal

HTTP 503: Storage unavailable

## Configure approved credit and low-balance threshold

`PUT /admin/v1/organizations/{organization}/billing/accounts/{currency}/policy`

Installation write access only. Creates a zero-balance account if absent, with expected revision zero. Updates are revision checked and recorded in immutable history. Credit changes do not credit funds. Reductions that would invalidate held reservations are rejected. With no holds, reduced credit can exhaust capacity while preserving the actual debt. A null warning threshold disables low-balance warnings. This configures warning state, not notification-channel delivery.

Implementation: `implemented`. Operation: `configureCustomerBalancePolicy`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Parameters

`organization` (path, required)

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
    "credit_limit_nanos",
    "expected_revision"
  ],
  "properties": {
    "credit_limit_nanos": {
      "type": "string",
      "pattern": "^[0-9]+$"
    },
    "warning_threshold_nanos": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$"
    },
    "expected_revision": {
      "type": "string",
      "pattern": "^[0-9]+$"
    }
  }
}
```

### Responses

HTTP 200: Policy saved

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
          "pattern": "^[0-9]+$"
        }
      },
      "required": [
        "revision"
      ]
    }
  },
  "required": [
    "data"
  ]
}
```

HTTP 400: Invalid currency, amount or revision

HTTP 401: Authentication required

HTTP 403: Installation write access required

HTTP 409: Stale revision, unknown company or outstanding reservations prevent credit reduction

## Set company low-balance warning threshold

`PUT /admin/v1/organizations/{organization}/billing/accounts/{currency}/warning-threshold`

Organization-wide owner/admin with write access or installation administrator only. Updates an existing account warning preference with revision checking; never changes funds or approved credit. Null or omitted threshold disables the warning. This does not configure external notifications.

Implementation: `implemented`. Operation: `setCustomerBalanceWarning`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Parameters

`organization` (path, required)

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
    "expected_revision"
  ],
  "properties": {
    "warning_threshold_nanos": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$",
      "description": "Exact nonnegative nanounits up to 9223372036854775807; null disables the warning."
    },
    "expected_revision": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Exact current policy revision from zero through 9223372036854775806."
    }
  }
}
```

### Responses

HTTP 200: Updated preference revision

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
          "pattern": "^[0-9]+$"
        }
      },
      "required": [
        "revision"
      ]
    }
  },
  "required": [
    "data"
  ]
}
```

HTTP 400: Invalid amount or revision

HTTP 401: Authentication required

HTTP 403: Write permission required

HTTP 404: Company billing access not granted

HTTP 409: Missing account or stale revision

HTTP 422: Invalid body schema or unexpected field

## Record a balance refund or settled-funding reversal

`POST /admin/v1/organizations/{organization}/billing/entries/{entry}/reversal`

Installation write access only. Funding entries can be reversed; charge entries can be refunded to account balance. Original records remain immutable. Cumulative reversals cannot exceed the original amount. Identical idempotency-key replay applies once; conflicting reuse is rejected. A verified funding reversal may create debt and reduce available funds without releasing in-flight liabilities. This records a ledger adjustment and does not execute external refunds or payments.

Implementation: `implemented`. Operation: `reverseCustomerBalanceEntry`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`entry` (path, required)

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
    "idempotency_key"
  ],
  "properties": {
    "amount_nanos": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Positive signed-64-bit nanounit amount"
    },
    "idempotency_key": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

### Responses

HTTP 200: Recorded or identical replay

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "recorded": {
          "type": "boolean",
          "const": true
        }
      },
      "required": [
        "recorded"
      ]
    }
  },
  "required": [
    "data"
  ]
}
```

HTTP 400: Invalid amount

HTTP 401: Authentication required

HTTP 403: Installation write access required

HTTP 409: Unknown or unsupported original entry, over-refund or conflicting replay

## Read a company balance transaction page

`GET /admin/v1/organizations/{organization}/billing/transactions`

Organization-wide owner/admin or installation access required. Customer ledger only; no Supplier costs or margins. Ordered by descending recorded time and internal reference. UUIDs are API routing references and must not be displayed as product labels. Each page contains up to 100 entries; next_cursor is null at the end. Pass the cursor as before to read older entries. Unknown or foreign cursors return a conflict. Traversal is a live view, not a fixed export snapshot; newly inserted later entries appear on refresh.

Implementation: `implemented`. Operation: `getCustomerBalanceTransactions`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Parameters

`organization` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`before` (query, optional)

next_cursor returned by the previous page. Must belong to this company.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Customer balance entries

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
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "kind": {
            "type": "string",
            "enum": [
              "funding",
              "charge",
              "refund",
              "funding_reversal",
              "adjustment"
            ]
          },
          "currency": {
            "type": "string",
            "pattern": "^[A-Z]{3}$"
          },
          "amount_nanos": {
            "type": "string",
            "pattern": "^-?[0-9]+$"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "reverses_entry_id": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          }
        }
      }
    }
  }
}
```

HTTP 400: Invalid query or cursor syntax

HTTP 401: Authentication required

HTTP 409: Cursor does not belong to this company ledger

HTTP 404: Company account access not granted

## Read EPay configuration with platform administrator read access

`GET /admin/v1/platform/payments/epay`

Returns enabled, merchant_id, endpoint, notify_url, return_url, methods, has_key and an exact string revision. Never returns merchant keys. Without a saved configuration, reads sanitized deployment defaults.

Implementation: `implemented`. Operation: `getPlatformEPayConfiguration`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

Installation credential or an explicit platform-administrator grant required, independent of customer company role. Capability inventory is independent of merchant activation. Returns no merchant configuration or credentials. Refunds means refund initiation; query recovery is limited to the declared scope.

Implementation: `implemented`. Operation: `listPaymentIntegrations`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

HTTP 403: Platform administration authority required

## Create or recover a company prepaid top-up

`POST /admin/v1/organizations/{organization}/billing/topups`

Organization-wide owner/admin with write access or installation administrator only. Requires an enabled method and an existing account in the selected integration's currency. Classic EPay and native Zhifux use CNY; Stripe uses its configured supported currency. Exact positive amounts must match the integration's minor-unit precision. No implicit account creation, FX or approved credit. Reuse the same idempotency key and identical intent after an uncertain response. Remote creation is durably claimed before contact and never automatically repeated; EPay saves a deterministic signed checkout locally. Checkout alone grants no balance. Independently verified payment gates funding. Merchant credentials and enabled methods are deployment configuration. An explicit payment_gateway never falls through to another integration. Omission preserves runtime priority for compatibility.

Implementation: `implemented`. Operation: `createCustomerTopup`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

## Receive a signed Stripe checkout notification

`POST /payments/stripe/notify`

Server-to-server callback; no installation or workspace bearer token is required. Verifies the signature over the original request bytes before parsing JSON, then requires an existing merchant-bound order and its saved checkout session. Paid evidence must match the saved session, amount, currency and configured live mode. Settlement is idempotent. Creating a checkout or visiting its return URL does not credit a balance. Unsupported or unrelated events are rejected rather than silently acknowledged. Maximum request body: 262144 bytes.

Implementation: `implemented`. Operation: `receiveStripePaymentNotification`.

### Authentication

No OpenAPI security scheme is required. Signature and other request validation still apply as described above.

### Parameters

`stripe-signature` (header, required)

Stripe timestamp and v1 signature of the unmodified request body.

```json
{
  "type": "string"
}
```

### Request body

Required.

Original signed Stripe event JSON; proxies must preserve its bytes.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": true
}
```

### Responses

HTTP 200: Verified settlement accepted, including an already settled replay; empty response body.

HTTP 400: Missing or invalid signature, malformed notification, unknown or unbound order, or mismatched paid evidence.

HTTP 409: Stored order conflicts with settlement.

HTTP 413: Request body exceeds 262144 bytes.

HTTP 502: Stripe is not configured or the payment clock is unavailable.

HTTP 503: Durable storage is unavailable.

## Receive a signed classic EPay form notification

`POST /payments/epay/notify`

Same verified funding contract as GET. Form bodies are limited to 8192 bytes. Rejects duplicate and unknown fields before verification. Post-body processing has a two-second deadline. Acknowledgment follows durable funding; replay never creates a second credit.

Implementation: `implemented`. Operation: `receiveEPayFormNotification`.

### Authentication

No OpenAPI security scheme is required. Signature and other request validation still apply as described above.

### Request body

Required.

Content type: `application/x-www-form-urlencoded`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "pid",
    "out_trade_no",
    "trade_no",
    "type",
    "money",
    "trade_status",
    "sign",
    "sign_type"
  ],
  "properties": {
    "pid": {
      "type": "string",
      "pattern": "^[0-9]{1,32}$"
    },
    "out_trade_no": {
      "type": "string",
      "pattern": "^[0-9a-f]{32}$"
    },
    "trade_no": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_-]{1,128}$"
    },
    "type": {
      "type": "string"
    },
    "money": {
      "type": "string",
      "description": "Exact decimal CNY matching the saved intent."
    },
    "trade_status": {
      "type": "string",
      "const": "TRADE_SUCCESS"
    },
    "sign": {
      "type": "string",
      "pattern": "^[0-9a-f]{32}$"
    },
    "sign_type": {
      "type": "string",
      "const": "MD5"
    },
    "name": {
      "type": "string",
      "maxLength": 1024
    }
  }
}
```

### Responses

HTTP 200: Verified payment committed or replayed; exactly one saved-order credit

Response header: `Cache-Control`.

```json
{
  "type": "string",
  "const": "no-store"
}
```

Content type: `text/plain`.

```json
{
  "type": "string",
  "const": "success"
}
```

HTTP 400: Invalid form content type, notification or signed saved-order evidence

HTTP 409: Payment identity conflicts with an existing binding or another order

HTTP 413: Form exceeds 8192 bytes

HTTP 502: Integration unavailable or processing deadline exceeded; retry delivery

HTTP 503: Durable storage unavailable; retry notification

## Receive a signed classic EPay query notification

`GET /payments/epay/notify`

Bounded to 8192 query bytes. Duplicate or unknown fields are rejected. Verifies the configured merchant and exact saved CNY order, method and amount before binding payment identity and funding exactly once. A browser return is never payment evidence. Post-input processing has a two-second deadline; timeout requires delivery retry. Merchant compatibility and live collection remain unqualified.

Implementation: `implemented`. Operation: `receiveEPayQueryNotification`.

### Authentication

No OpenAPI security scheme is required. Signature and other request validation still apply as described above.

### Parameters

`pid` (query, required)

```json
{
  "type": "string",
  "pattern": "^[0-9]{1,32}$"
}
```

`out_trade_no` (query, required)

```json
{
  "type": "string",
  "pattern": "^[0-9a-f]{32}$"
}
```

`trade_no` (query, required)

```json
{
  "type": "string",
  "pattern": "^[A-Za-z0-9_-]{1,128}$"
}
```

`type` (query, required)

```json
{
  "type": "string"
}
```

`money` (query, required)

```json
{
  "type": "string",
  "description": "Exact decimal CNY matching the saved intent."
}
```

`trade_status` (query, required)

```json
{
  "type": "string",
  "const": "TRADE_SUCCESS"
}
```

`sign` (query, required)

```json
{
  "type": "string",
  "pattern": "^[0-9a-f]{32}$"
}
```

`sign_type` (query, required)

```json
{
  "type": "string",
  "const": "MD5"
}
```

`name` (query, optional)

```json
{
  "type": "string",
  "maxLength": 1024
}
```

### Responses

HTTP 200: Verified payment committed or replayed; exactly one saved-order credit

Response header: `Cache-Control`.

```json
{
  "type": "string",
  "const": "no-store"
}
```

Content type: `text/plain`.

```json
{
  "type": "string",
  "const": "success"
}
```

HTTP 400: Invalid notification, signature or saved-order evidence

HTTP 409: Payment identity conflicts with an existing binding or another order

HTTP 502: Integration unavailable or processing deadline exceeded; retry delivery

HTTP 503: Durable storage unavailable; retry notification

## Read Supplier business profile

`GET /admin/v1/providers/{provider}`

Requires platform management permission. Returns business display metadata and an integer profile revision. Optional descriptive text and URLs are represented as empty strings when unset. Does not return credentials, procurement prices or qualification evidence. Internal identity is for routing, not display.

Implementation: `implemented`. Operation: `getSupplierProfile`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Parameters

`provider` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Saved Supplier profile

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
        "name",
        "description",
        "website_url",
        "logo_url",
        "id",
        "revision"
      ],
      "properties": {
        "name": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "website_url": {
          "type": "string"
        },
        "logo_url": {
          "type": "string"
        },
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "revision": {
          "type": "integer",
          "format": "int64"
        }
      }
    }
  }
}
```

HTTP 400: Invalid identifier

HTTP 401: Authentication required

HTTP 403: Platform management permission required

HTTP 404: Supplier missing or deleted

HTTP 503: Storage unavailable

## Update Supplier business profile

`PATCH /admin/v1/providers/{provider}`

Requires platform write authority. Name is required. Omitted or null description/URL fields retain saved values; an empty string clears them. All text is trimmed. Supply the integer expected_revision to reject stale edits; omission or null preserves legacy unconditional updates. Every accepted update increments the profile revision and records an audit event, even if values are unchanged. URLs are stored metadata and are not fetched by this operation.

Implementation: `implemented`. Operation: `renameSupplierBusiness`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Parameters

`provider` (path, required)

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
    "name"
  ],
  "properties": {
    "name": {
      "type": "string",
      "description": "Nonblank, at most 100 UTF-8 bytes, with no control characters."
    },
    "description": {
      "type": [
        "string",
        "null"
      ],
      "description": "Up to 2,000 characters after trimming; newline, carriage return and tab are permitted."
    },
    "expected_revision": {
      "type": [
        "integer",
        "null"
      ],
      "format": "int64",
      "minimum": 1,
      "description": "Send the last read integer revision for conflict protection."
    },
    "website_url": {
      "type": [
        "string",
        "null"
      ],
      "description": "Empty to clear, null/omitted to preserve. Nonempty values must be HTTP(S) URLs with a host, no credentials or control characters and at most 2,048 UTF-8 bytes after trimming."
    },
    "logo_url": {
      "type": [
        "string",
        "null"
      ],
      "description": "Empty to clear, null/omitted to preserve. Nonempty values must be HTTP(S) URLs with a host, no credentials or control characters and at most 2,048 UTF-8 bytes after trimming."
    }
  }
}
```

### Responses

HTTP 200: Saved Supplier profile

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
        "name",
        "description",
        "website_url",
        "logo_url",
        "id",
        "revision"
      ],
      "properties": {
        "name": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "website_url": {
          "type": "string"
        },
        "logo_url": {
          "type": "string"
        },
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "revision": {
          "type": "integer",
          "format": "int64"
        }
      }
    }
  }
}
```

HTTP 400: Invalid profile fields or identifier

HTTP 401: Authentication required

HTTP 403: Platform write authority required

HTTP 503: Storage unavailable

HTTP 409: Stale revision, missing or deleted Supplier

HTTP 422: Invalid body shape or unknown field

## List Supplier business members

`GET /admin/v1/providers/{provider}/members`

Requires platform management permission. Lists saved memberships ordered by member name and internal identity. active is false when membership is disabled or the member account is revoked; revoked reports account revocation separately. No tokens, merchant secrets or procurement amounts are returned. Internal operator identities are for routing, not product labels.

Implementation: `implemented`. Operation: `listSupplierMembers`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Parameters

`provider` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Saved membership list, including inactive or revoked members

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
          "operator_id",
          "name",
          "role",
          "active",
          "revoked"
        ],
        "properties": {
          "operator_id": {
            "type": "string",
            "format": "uuid"
          },
          "name": {
            "type": "string"
          },
          "role": {
            "type": "string",
            "enum": [
              "manager",
              "viewer"
            ]
          },
          "active": {
            "type": "boolean"
          },
          "revoked": {
            "type": "boolean"
          }
        }
      }
    }
  }
}
```

HTTP 400: Invalid identifier

HTTP 401: Authentication required

HTTP 403: Platform management permission required

HTTP 409: Supplier missing or deleted

HTTP 503: Storage unavailable

## Read platform payment configuration presence

`GET /admin/v1/platform/configuration`

Requires platform management permission. Returns configuration-presence flags without merchant credentials. EPay is configured when a saved configuration exists (including disabled configurations) or deployment configuration is present; Zhifux and Stripe reflect loaded runtime adapters. Use customer payment-method discovery for checkout availability and the integration inventory for supported capabilities. This response does not prove successful external payments.

Implementation: `implemented`. Operation: `getPlatformConfiguration`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

## List Supplier API-key configurations without credentials

`GET /admin/v1/vendors`

Returns every matching configuration, including disabled configurations, in one data array. Optional supplier filtering uses explicit business ownership. No pagination or silent row cap; response memory grows with list size. Requires installation administration or an explicitly granted platform administrator. Each configuration has independent credentials and model bindings. Credentials are write-only and never returned.

Implementation: `implemented`. Operation: `listVendors`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Parameters

`supplier` (query, optional)

Filter by explicit Supplier business ownership; no name matching or unassociated fallback. Platform administration is required.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Vendor metadata. All management responses use Cache-Control no-store.

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
        "$ref": "#/components/schemas/Vendor"
      }
    }
  }
}
```

HTTP 403: Platform administration permission required.

HTTP 401: Invalid or expired administrative credential.

## Create an encrypted Supplier API-key configuration

`POST /admin/v1/vendors`

 Requires installation administration or an explicitly granted platform administrator. Each configuration has independent credentials and model bindings. Credentials are write-only and never returned.

Implementation: `implemented`. Operation: `createVendor`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Request body

Required.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/VendorCreate"
}
```

### Responses

HTTP 201: Created vendor metadata wrapped in data. The credential is never returned.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "$ref": "#/components/schemas/Vendor"
    }
  }
}
```

HTTP 400: Invalid vendor configuration.

HTTP 403: Platform administration permission required.

HTTP 409: Vendor name already exists.

HTTP 503: Storage or credential encryption unavailable.

HTTP 401: Invalid or expired administrative credential.

## Update one Supplier API-key configuration or rotate its credential

`PUT /admin/v1/vendors/{id}`

Adapter is immutable. Changes affect new requests; already dispatched work can finish using its original configuration. Requires installation administration or an explicitly granted platform administrator. Each configuration has independent credentials and model bindings. Credentials are write-only and never returned.

Implementation: `implemented`. Operation: `updateVendor`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Parameters

`id` (path, required)

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
  "$ref": "#/components/schemas/VendorUpdate"
}
```

### Responses

HTTP 200: Updated vendor metadata wrapped in data.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "$ref": "#/components/schemas/Vendor"
    }
  }
}
```

HTTP 400: Invalid configuration or credential.

HTTP 403: Platform administration permission required.

HTTP 404: Vendor does not exist.

HTTP 409: Stale revision or conflicting name.

HTTP 401: Invalid or expired administrative credential.

## List model bindings for one Supplier API-key configuration

`GET /admin/v1/vendors/{id}/models`

Management reads include route eligibility in available and an owner_funded flag. Owner-funded routes are private to their recorded account and excluded from shared supply and the public catalog, regardless of their legacy configured public_catalog flag. Available does not establish upstream entitlement, service quality or commercial qualification. Requires installation administration or an explicitly granted platform administrator. These platform-only route prices are procurement configuration, not customer selling tariffs.

Implementation: `implemented`. Operation: `listVendorModels`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Parameters

`id` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Model mappings wrapped in data.

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "$ref": "#/components/schemas/VendorModel"
      }
    }
  },
  "required": [
    "data"
  ]
}
```

HTTP 403: Platform administration permission required.

HTTP 404: Vendor does not exist.

HTTP 401: Invalid or expired administrative credential.

## Discover upstream models for a Supplier API-key configuration

`GET /admin/v1/vendors/{id}/catalog`

Makes a bounded GET to the configured provider /models endpoint using the encrypted server-side credential. No inference request is sent. Redirects are blocked, the response body is capped at 2 MiB, and only allowlisted model IDs and catalog metadata (display name, description, context and output limits, modalities, and advertised USD token prices) are returned. Provider credentials and raw response data are never returned. Requires installation administration or an explicitly granted platform administrator.

Implementation: `implemented`. Operation: `listProviderModelCatalog`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Parameters

`id` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Provider model metadata wrapped in data.

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
      "maxItems": 2000,
      "items": {
        "$ref": "#/components/schemas/ProviderCatalogModel"
      }
    }
  }
}
```

HTTP 403: Platform administration permission required.

HTTP 404: Vendor does not exist.

HTTP 502: Provider rejected the credential or returned an invalid catalog or request error.

HTTP 401: Invalid or expired administrative credential.

## Check provider reachability and whether a mapped model is listed

`POST /admin/v1/vendors/{id}/check`

Performs a bounded GET to the provider's /models endpoint. It does not send an inference request. Redirects are blocked, response bodies are capped at 2 MiB, and provider response content and credentials are never returned. A listed model does not prove inference entitlement or quota. Requires installation administration or an explicitly granted platform administrator.

Implementation: `implemented`. Operation: `checkVendorModel`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Parameters

`id` (path, required)

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
  "required": [
    "alias"
  ],
  "properties": {
    "alias": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  }
}
```

### Responses

HTTP 200: Sanitized provider check result wrapped in data.

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
        "status",
        "model",
        "http_status",
        "duration_ms",
        "checked_at_ms"
      ],
      "properties": {
        "status": {
          "type": "string",
          "enum": [
            "connected",
            "credentials_rejected",
            "endpoint_unavailable",
            "private_endpoint_blocked",
            "invalid_endpoint",
            "redirect_blocked",
            "provider_rate_limited",
            "provider_error",
            "model_catalog_unavailable",
            "model_catalog_too_large",
            "invalid_model_catalog"
          ]
        },
        "model": {
          "type": "string",
          "enum": [
            "listed",
            "not_listed",
            "unknown"
          ]
        },
        "http_status": {
          "type": [
            "integer",
            "null"
          ]
        },
        "duration_ms": {
          "type": "integer",
          "minimum": 0
        },
        "checked_at_ms": {
          "type": "integer",
          "minimum": 0
        }
      }
    }
  }
}
```

HTTP 400: Invalid model alias.

HTTP 403: Platform administration permission required.

HTTP 404: Model alias is not mapped to this vendor.

HTTP 503: Credential decryption or storage unavailable.

HTTP 401: Invalid or expired administrative credential.

## Create or update a model mapping with optimistic revision checks

`POST /admin/v1/vendors/{id}/models`

Omit expected_revision to create; provide the current revision to update. Aliases cannot be reassigned to another vendor. Disabled mappings still override static file aliases. Requires installation administration or an explicitly granted platform administrator. These platform-only route prices are procurement configuration, not customer selling tariffs. Omit pricing to preserve it on update; explicit null clears it. Changes do not rewrite previously pinned request prices.

Implementation: `implemented`. Operation: `upsertVendorModel`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Parameters

`id` (path, required)

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
  "$ref": "#/components/schemas/VendorModelInput"
}
```

### Responses

HTTP 200: Persisted model mapping wrapped in data.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "$ref": "#/components/schemas/VendorModel"
    }
  }
}
```

HTTP 400: Invalid alias, capabilities or pricing.

HTTP 403: Platform administration permission required.

HTTP 404: Vendor does not exist.

HTTP 409: Stale revision, existing alias or different vendor ownership.

HTTP 401: Invalid or expired administrative credential.

## Refresh descriptive metadata for existing vendor model mappings

`POST /admin/v1/vendors/{id}/catalog`

Fetches the bounded provider catalog and updates matching upstream IDs only. Preserves aliases, routing, capability declarations and billing prices. Increments revisions when metadata changes. Missing provider models are retained. Requires installation administration or an explicitly granted platform administrator.

Implementation: `implemented`. Operation: `refreshProviderCatalogMetadata`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Parameters

`id` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Number of updated mappings.

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "updated": {
      "type": "integer",
      "minimum": 0
    }
  },
  "required": [
    "updated"
  ]
}
```

HTTP 403: Platform administration permission required.

HTTP 404: Vendor does not exist.

HTTP 502: Provider catalog unavailable or invalid.

HTTP 401: Invalid or expired administrative credential.

## Read an installation-managed model candidate pool

`GET /admin/v1/model-route-pools`

Platform administration required: installation credentials or an explicitly authorized platform administrator. Ordinary company/workspace ownership does not grant this access. 

Implementation: `implemented`. Operation: `getModelRoutePool`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Parameters

`alias` (query, required)

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 200
}
```

### Responses

HTTP 200: Current pool configuration

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "$ref": "#/components/schemas/ModelRoutePool"
    }
  }
}
```

HTTP 403: Platform administration required

HTTP 404: Pool not found

HTTP 401: Authentication required

HTTP 400: Invalid query or revision cursor; framework query errors may use plain text.

## Create or revise a model candidate pool

`PUT /admin/v1/model-route-pools`

Platform administration required: installation credentials or an explicitly authorized platform administrator. Ordinary company/workspace ownership does not grant this access. Revisions start at zero for creation. Ownership is immutable. Candidate aliases identify existing credential/model mappings, not nested pools. Personal pools require all candidates owned by that organization; shared pools require nonpersonal priced mappings. Video mappings are rejected. Highest eligible priority wins, with weighted selection within that tier. No post-dispatch retries are performed.

Implementation: `implemented`. Operation: `setModelRoutePool`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Request body

Required.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "alias",
    "organization_id",
    "enabled",
    "expected_revision",
    "candidates"
  ],
  "properties": {
    "alias": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200,
      "pattern": "^[!-~]+$"
    },
    "organization_id": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    },
    "enabled": {
      "type": "boolean"
    },
    "expected_revision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740990
    },
    "candidates": {
      "type": "array",
      "minItems": 1,
      "maxItems": 64,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "alias",
          "priority",
          "weight",
          "enabled"
        ],
        "properties": {
          "alias": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200
          },
          "priority": {
            "type": "integer",
            "minimum": -1000,
            "maximum": 1000
          },
          "weight": {
            "type": "integer",
            "minimum": 1,
            "maximum": 10000
          },
          "enabled": {
            "type": "boolean"
          }
        }
      }
    }
  }
}
```

### Responses

HTTP 200: Saved revision; changes apply to later admission and stale snapshots reject before dispatch

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
          "type": "integer",
          "minimum": 1,
          "maximum": 9007199254740991
        }
      }
    }
  }
}
```

HTTP 400: Invalid candidates, bounds, ownership, reserved alias or unsupported mapping

HTTP 403: Platform administration required

HTTP 409: Stale revision or attempted ownership change

HTTP 401: Authentication required

HTTP 422: Malformed body schema or unknown fields; framework rejection may use plain text.

## Read immutable model candidate pool revisions

`GET /admin/v1/model-route-pools/history`

Platform administration required: installation credentials or an explicitly authorized platform administrator. Ordinary company/workspace ownership does not grant this access. 

Implementation: `implemented`. Operation: `listModelRoutePoolHistory`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Parameters

`alias` (query, required)

```json
{
  "type": "string"
}
```

`before_revision` (query, optional)

```json
{
  "type": "integer",
  "minimum": 1
}
```

### Responses

HTTP 200: At most 100 immutable revisions in descending order

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
      "maxItems": 100,
      "items": {
        "allOf": [
          {
            "$ref": "#/components/schemas/ModelRoutePool"
          },
          {
            "type": "object",
            "required": [
              "recorded_at"
            ],
            "properties": {
              "recorded_at": {
                "type": "string",
                "format": "date-time"
              }
            }
          }
        ]
      }
    }
  }
}
```

HTTP 403: Platform administration required

HTTP 404: Pool not found

HTTP 401: Authentication required

HTTP 400: Invalid query or revision cursor; framework query errors may use plain text.

## List platform-managed model route pools

`GET /admin/v1/model-route-pools/index`

Installation credential or explicit platform-administrator grant required. Lists enabled and disabled shared and personal pools with their current configuration. Ordered by alias using database ordering. after is the exclusive alias cursor returned as next_after; it need not identify a currently existing pool. This is a live view, not a cross-page snapshot: new aliases before the cursor require a fresh traversal. No upstream requests, credentials, endpoints or prices are returned. Pool organization identifiers are API references, not display labels.

Implementation: `implemented`. Operation: `listModelRoutePools`.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

### Parameters

`after` (query, optional)

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 200,
  "pattern": "^[!-~]+$"
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

HTTP 200: Bounded current configurations and continuation cursor.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "has_more",
    "next_after"
  ],
  "additionalProperties": false,
  "properties": {
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "$ref": "#/components/schemas/ModelRoutePool"
      }
    },
    "has_more": {
      "type": "boolean"
    },
    "next_after": {
      "type": [
        "string",
        "null"
      ]
    }
  }
}
```

HTTP 400: Invalid query, alias cursor or page size; framework query errors may use plain text.

HTTP 401: Authentication required.

HTTP 403: Platform administration required.

## Create an OpenAI-compatible chat completion

`POST /v1/chat/completions`

Uses the workspace API key and its model grants, source policy, rate/concurrency/token limits and configured billing. Streaming HTTP 200 starts delivery; completion and reported usage require the terminal stream evidence. Niu does not execute function tools. See the supported scope below for structured output and modality restrictions.

Implementation: `implemented`. Operation: `createChatCompletion`.

### Supported scope

Basic chat is implemented for configured native provider routes. Function tools, streaming tool deltas, and structured JSON are opt-in on OpenAI-compatible routes only. Niu validates tool-call shape and structured JSON against a valid self-contained schema; json_object output must be an object. Schema compilation is offline and limited to 64 KiB, 4096 JSON nodes and depth 32, with bounded regular expressions. Niu does not execute tools. Structured JSON streaming validates assembled output before releasing [DONE], with a 1 MiB total content/refusal bound and at most 128 choices. Partial deltas are provisional; invalid final output sends an upstream_invalid_response SSE error without [DONE], while reported terminal usage remains accounting evidence. Token-priced routes support function calls and text-only tool-result conversations under the same input/output rates. Serialized messages, tool definitions, tool choices and response-format instructions count toward the configured input byte guard. Hosted tools and additional billable modalities remain unsupported.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

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

### Parameters

`x-niu-log-payloads` (header, optional)

Request and sanitized customer response content is retained until 24 hours after the original request creation time by default. Send false (case-insensitive) to disable capture for this request; true or an omitted header retains content. Invalid values or repeated headers are rejected before inference. Requests exceeding the 1 MB capture limit are rejected; response capture is truncated at 1 MB. Does not backfill earlier requests.

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

`X-Niu-Task-ID` (header, optional)

Optional opaque task correlation key. Requests with the same value can be grouped in workspace activity. Niu stores the value as metadata and does not forward it to the provider.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 200,
  "pattern": "^[!-~]{1,200}$"
}
```

### Request body

Required.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ChatCompletionRequest"
}
```

### Responses

HTTP 200: A normalized chat completion or compatible event stream.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ChatCompletionResponse"
}
```

Content type: `text/event-stream`.

```json
{
  "type": "string",
  "description": "Chat completion SSE chunks. HTTP 200 starts the stream; preserve terminal evidence and optional usage rather than treating a disconnected stream as complete."
}
```

HTTP 400: Invalid request, generation-parameter type or range, or unsupported operation; rejected before admission and Supplier dispatch.

HTTP 401: Missing or invalid gateway credentials.

HTTP 409: Admission conflict before dispatch. Type route_configuration_changed identifies a changed managed credential/model configuration; that request was not sent upstream. Other conflicts retain their own error type.

HTTP 501: Tool or structured-output capability is disabled, or the requested combination is unsupported. The unsupported_operation_error message identifies the feature and a supported request alternative; rejection occurs before admission or upstream dispatch.

HTTP 502: Provider request failed.

HTTP 402: Insufficient balance or spending limit exceeded.

HTTP 403: Source IP or enforced policy denies the request.

HTTP 429: API key request, concurrency or token rate limit exceeded.

HTTP 503: Durable storage or configured route unavailable.

HTTP 413: Request body exceeds 1 MiB; rejected before inference whether payload capture is enabled or disabled. Framework responses may use a plain-text body.

## Create a Chat completion with a selected workspace key

`POST /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/chat/completions`

Requires workspace write authority and an active selected key in that workspace. The key supplies model grants, IP policy, limits and billing attribution; the member token is not forwarded upstream. Uses the same Chat execution path as /v1/chat/completions, including streaming, tools and structured output. No key secret is returned. HTTP 200 starts a stream and does not alone prove completed generation or known usage.

Implementation: `implemented`. Operation: `createDashboardChatCompletion`.

### Supported scope

Basic chat is implemented for configured native provider routes. Function tools, streaming tool deltas, and structured JSON are opt-in on OpenAI-compatible routes only. Niu validates tool-call shape and structured JSON against a valid self-contained schema; json_object output must be an object. Schema compilation is offline and limited to 64 KiB, 4096 JSON nodes and depth 32, with bounded regular expressions. Niu does not execute tools. Structured JSON streaming validates assembled output before releasing [DONE], with a 1 MiB total content/refusal bound and at most 128 choices. Partial deltas are provisional; invalid final output sends an upstream_invalid_response SSE error without [DONE], while reported terminal usage remains accounting evidence. Token-priced routes support function calls and text-only tool-result conversations under the same input/output rates. Serialized messages, tool definitions, tool choices and response-format instructions count toward the configured input byte guard. Hosted tools and additional billable modalities remain unsupported.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

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

`x-niu-log-payloads` (header, optional)

Request and sanitized customer response content is retained until 24 hours after the original request creation time by default. Send false (case-insensitive) to disable capture for this request; true or an omitted header retains content. Invalid values or repeated headers are rejected before inference. Requests exceeding the 1 MB capture limit are rejected; response capture is truncated at 1 MB. Does not backfill earlier requests.

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

`X-Niu-Task-ID` (header, optional)

Optional opaque task correlation key. Requests with the same value can be grouped in project activity. Niu stores the value as metadata and does not forward it to the provider.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 200,
  "pattern": "^[!-~]{1,200}$"
}
```

### Request body

Required.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ChatCompletionRequest"
}
```

### Responses

HTTP 200: A normalized chat completion or compatible event stream.

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/ChatCompletionResponse"
}
```

Content type: `text/event-stream`.

```json
{
  "type": "string",
  "description": "Chat completion SSE chunks. HTTP 200 starts the stream; preserve terminal evidence and optional usage rather than treating a disconnected stream as complete."
}
```

HTTP 400: Invalid request, generation-parameter type or range, or unsupported operation; rejected before admission and Supplier dispatch.

HTTP 401: Missing or invalid gateway credentials.

HTTP 409: Admission conflict before dispatch. Type route_configuration_changed identifies a changed managed credential/model configuration; that request was not sent upstream. Other conflicts retain their own error type.

HTTP 501: Tool or structured-output capability is disabled, or the requested combination is unsupported. The unsupported_operation_error message identifies the feature and a supported request alternative; rejection occurs before admission or upstream dispatch.

HTTP 502: Provider request failed.

HTTP 402: Insufficient spending capacity or budget

HTTP 403: Workspace write or source-IP permission denied

HTTP 404: Requested model unavailable to the selected key

HTTP 429: Rate or concurrency admission limit exceeded

HTTP 503: Route or durable storage unavailable

HTTP 413: Request body exceeds 1 MiB; rejected before inference whether payload capture is enabled or disabled. Framework responses may use a plain-text body.

## Create OpenAI-compatible text embeddings

`POST /v1/embeddings`

The configured route must use an OpenAI-compatible protocol and explicitly declare embedding support. Optional dimensions and base64 output require separate route capabilities. These declarations are operator assertions, not provider conformance evidence. Unsupported providers or capabilities are rejected before durable operation and attempt creation. Workspace model grants, IP policy, rate/concurrency/token limits and configured customer billing apply before dispatch.

Implementation: `implemented`. Operation: `createEmbedding`.

### Supported scope

OpenAI-compatible text inputs and float/base64 response vectors; no token-ID arrays, multimodal inputs, or streaming.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

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

### Parameters

`x-niu-log-payloads` (header, optional)

Request and sanitized customer response content is retained until 24 hours after the original request creation time by default. Send false (case-insensitive) to disable capture for this request; true or an omitted header retains content. Invalid values or repeated headers are rejected before inference. Requests exceeding the 1 MB capture limit are rejected; response capture is truncated at 1 MB. Does not backfill earlier requests.

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

`X-Niu-Task-ID` (header, optional)

Optional opaque task correlation key. Requests with the same value can be grouped in workspace activity. Niu stores the value as metadata and does not forward it to the provider.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 200,
  "pattern": "^[!-~]{1,200}$"
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
          "maxItems": 2048,
          "items": {
            "type": "string",
            "minLength": 1
          }
        }
      ]
    },
    "encoding_format": {
      "type": "string",
      "enum": [
        "float",
        "base64"
      ],
      "default": "float"
    },
    "dimensions": {
      "type": "integer",
      "minimum": 1,
      "maximum": 65536
    },
    "user": {
      "type": "string",
      "maxLength": 512
    }
  }
}
```

### Responses

HTTP 200: One validated embedding per input item; the configured upstream model is replaced with the public model alias.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "object",
    "data",
    "model"
  ],
  "properties": {
    "object": {
      "type": "string",
      "const": "list"
    },
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "embedding"
        ],
        "properties": {
          "object": {
            "type": "string",
            "const": "embedding"
          },
          "index": {
            "type": "integer",
            "minimum": 0
          },
          "embedding": {
            "oneOf": [
              {
                "type": "array",
                "items": {
                  "type": "number"
                }
              },
              {
                "type": "string"
              }
            ]
          }
        },
        "additionalProperties": true
      }
    },
    "model": {
      "type": "string"
    },
    "usage": {
      "type": "object",
      "properties": {
        "prompt_tokens": {
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

HTTP 400: Invalid body, unsupported field, or invalid input shape.

HTTP 413: Request body exceeds 1 MiB; rejected before inference whether payload capture is enabled or disabled. Framework responses may use a plain-text body.

HTTP 401: Missing or invalid gateway credentials.

HTTP 404: Model alias does not exist or is unavailable to this key.

HTTP 409: Admission conflict before dispatch. Type route_configuration_changed identifies a changed managed credential/model configuration; that request was not sent upstream. Other conflicts retain their own error type.

HTTP 501: The model route lacks the required embedding, configurable-dimension or base64 capability, or uses an unsupported protocol. The unsupported_operation_error message identifies the limitation and request alternative before admission.

HTTP 502: Provider request failed or returned an invalid embedding response.

HTTP 422: Request body is not valid JSON.

HTTP 402: Insufficient balance or configured spending limit exceeded.

HTTP 403: Source IP or enforced policy denies the request.

HTTP 429: API key request, concurrency or token rate limit exceeded.

HTTP 503: Durable storage or configured route unavailable.

## Create a text response

`POST /v1/responses`

The route must be an OpenAI-compatible provider route with supports_responses enabled. This public subset accepts a single text input and optional text instructions, output limit, sampling values, metadata and user identifier. Text streaming returns Responses SSE events and preserves terminal reported usage. Each Responses event is bounded to 16 MiB of UTF-8 bytes because terminal events repeat the full output; Chat events retain their separate 64 KiB bound. Oversized or malformed events fail the stream without inventing usage. Multimodal input, tools, prior-response state and other fields are rejected. HTTP 200 at stream start does not establish completion; inspect the terminal response event. Workspace model grants, source policy, rate/concurrency/token limits and configured billing apply.

Implementation: `implemented`. Operation: `createResponse`.

### Supported scope

Text-only subset on explicitly configured OpenAI-compatible routes. Streaming requires a completed or incomplete response terminal event; disconnects retain uncertainty. Tool, multimodal and stateful conversation semantics are not implemented.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

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

### Parameters

`x-niu-log-payloads` (header, optional)

Request and sanitized customer response content is retained until 24 hours after the original request creation time by default. Send false (case-insensitive) to disable capture for this request; true or an omitted header retains content. Invalid values or repeated headers are rejected before inference. Requests exceeding the 1 MB capture limit are rejected; response capture is truncated at 1 MB. Does not backfill earlier requests.

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

`X-Niu-Task-ID` (header, optional)

Optional opaque task correlation key. Requests with the same value can be grouped in workspace activity. Niu stores the value as metadata and does not forward it to the provider.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 200,
  "pattern": "^[!-~]{1,200}$"
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
    "model",
    "input"
  ],
  "properties": {
    "model": {
      "type": "string",
      "minLength": 1
    },
    "input": {
      "type": "string",
      "minLength": 1
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
    "stream": {
      "type": "boolean",
      "default": false
    }
  }
}
```

### Responses

HTTP 200: A validated Responses API text response with the public model alias.

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

HTTP 400: Invalid body, unsupported field or invalid request shape.

HTTP 401: Missing or invalid gateway credentials.

HTTP 404: Model alias does not exist or is unavailable to this key.

HTTP 409: Admission conflict before dispatch. Type route_configuration_changed identifies a changed managed credential/model configuration; that request was not sent upstream. Other conflicts retain their own error type.

HTTP 501: Responses support is disabled, the route protocol is unsupported, or the requested feature is unsupported. The unsupported_operation_error message identifies the limitation and supported alternative before admission.

HTTP 502: Provider request failed or returned an invalid text response. Valid terminal usage is retained for accounting even when output delivery is rejected; an HTTP error alone does not prove nonexecution or authorize a safe retry.

HTTP 402: Insufficient balance or spending limit exceeded.

HTTP 403: Source IP or enforced policy denies the request.

HTTP 413: Request body exceeds 1 MiB; rejected before inference whether payload capture is enabled or disabled. Framework responses may use a plain-text body.

HTTP 422: Request body is not valid JSON.

HTTP 429: API key request, concurrency or token rate limit exceeded.

HTTP 503: Durable storage or configured route unavailable.

## List durable workspace video jobs

`GET /v1/video/jobs`

Reads saved dispatched jobs, including uncertain submissions, in newest-first creation order with an ID tie-breaker. Applies current key workspace/model grants and returns no upstream references, prompts, credentials or procurement terms. Listing does not poll or regenerate videos. Cursor jobs must remain accessible under the current key. New head entries do not move existing cursor positions.

Implementation: `implemented`. Operation: `listVideoJobHistory`.

### Supported scope

Reads persisted scoped evidence without upstream dispatch. Available results and customer charge settlement require separate evidence.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

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

### Parameters

`before` (query, optional)

next_before from the preceding page; scoped to currently accessible jobs.

```json
{
  "type": "string",
  "format": "uuid"
}
```

`limit` (query, optional)

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 25
}
```

### Responses

HTTP 200: Saved scoped job history

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data",
    "has_more",
    "next_before"
  ],
  "properties": {
    "has_more": {
      "type": "boolean"
    },
    "next_before": {
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
          "object",
          "model",
          "status",
          "created_at_ms"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "object": {
            "const": "video.job"
          },
          "model": {
            "type": "string"
          },
          "created_at_ms": {
            "type": "string",
            "pattern": "^-?[0-9]+$",
            "description": "Exact Unix milliseconds from the saved attempt."
          },
          "status": {
            "type": "string",
            "enum": [
              "submission_unknown",
              "queued",
              "running",
              "succeeded",
              "failed",
              "unknown",
              "reconciliation_required"
            ]
          }
        }
      }
    }
  }
}
```

HTTP 400: Invalid limit, unknown query field, malformed or inaccessible cursor

HTTP 401: Invalid, expired or revoked credential

## Read saved customer video billing

`GET /v1/video/jobs/{id}/billing`

Current workspace/model authorization applies. This read performs no upstream query or settlement. Exact amounts are decimal strings in billionths of the declared currency. Only a posted customer debit is a charge; unresolved liability remains explicit. Personal owner-funded jobs have no Niu customer price or charge. Procurement terms and internal revision identifiers are excluded.

Implementation: `implemented`. Operation: `retrieveVideoJobBilling`.

### Supported scope

Reads persisted scoped evidence without upstream dispatch. Available results and customer charge settlement require separate evidence.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

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

### Parameters

`id` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Saved customer accounting snapshot

Content type: `application/json`.

```json
{
  "$ref": "#/components/schemas/VideoJobBilling"
}
```

HTTP 401: Invalid credential

HTTP 404: Missing job or workspace/model access denied

## Read persisted video job state

`GET /v1/video/jobs/{id}`

Requires a current workspace API key with access to the original model. Reads saved evidence only; performs no upstream poll, generation or settlement. Succeeded does not guarantee available results, reported usage or a settled charge. No upstream identifiers, credentials or procurement values are returned.

Implementation: `implemented`. Operation: `retrieveVideoJobState`.

### Supported scope

Reads persisted scoped evidence without upstream dispatch. Available results and customer charge settlement require separate evidence.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

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

### Parameters

`id` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Durable scoped state

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "object",
    "model",
    "status"
  ],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "object": {
      "const": "video.job"
    },
    "model": {
      "type": "string"
    },
    "status": {
      "type": "string",
      "enum": [
        "submission_unknown",
        "queued",
        "running",
        "succeeded",
        "failed",
        "unknown",
        "reconciliation_required"
      ]
    }
  }
}
```

HTTP 401: Invalid, expired or revoked credential

HTTP 404: Missing job, workspace mismatch or model access denied

## Save an immutable text-video submission intent

`PUT /admin/v1/organizations/{organization}/projects/{project}/video-intents/{intent}`

Actor-owned workspace records: installation authority shares one installation actor, while operator actors are isolated even within the same workspace. Current workspace permission applies. Request content is retained for 30 days from creation or until deletion; expiry is unreadable immediately and background maintenance clears retained content. Identity tombstones remain. Deletion does not cancel an already accepted concurrent submission, erase its job or refund charges. Requires workspace write permission and an active selected key with model access and allowed source. A fresh client-generated intent UUID binds the exact request, original key and funding mode. Identical retries return the same record; changed input or key under that UUID conflicts. No attempt, upstream call or reservation is created. The internal idempotency identity is server-generated and is never exposed; use the submit operation rather than legacy job creation.

Implementation: `implemented`. Operation: `saveVideoSubmissionIntent`.

### Supported scope

Text-only durable intent persistence and explicit submission. Full browser restoration and customer-funded video qualification remain open.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

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

`intent` (path, required)

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
    "key_id",
    "request"
  ],
  "properties": {
    "key_id": {
      "type": "string",
      "format": "uuid"
    },
    "request": {
      "$ref": "#/components/schemas/VideoIntentRequest"
    }
  }
}
```

### Responses

HTTP 200: Save an immutable text-video submission intent

Response header: `Cache-Control`.

```json
{
  "type": "string",
  "const": "no-store"
}
```

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
      "$ref": "#/components/schemas/VideoSubmissionIntent"
    }
  }
}
```

HTTP 400: Invalid path, query or request; framework rejections may be plain text.

HTTP 401: Invalid actor credential or no authorized current key in the original lineage.

HTTP 403: Workspace permission or current source policy denied.

HTTP 404: Intent is not owned by this actor and workspace, or selected model is inaccessible.

HTTP 409: Immutable identity, request, funding mode, revision or cursor conflict.

HTTP 503: Required storage or route configuration is unavailable.

HTTP 501: Unsupported video capability or non-text intent.

HTTP 413: Request envelope exceeds 64 KiB.

## Restore a video intent and resolve its original job

`GET /admin/v1/organizations/{organization}/projects/{project}/video-intents/{intent}`

Actor-owned workspace records: installation authority shares one installation actor, while operator actors are isolated even within the same workspace. Current workspace permission applies. Request content is retained for 30 days from creation or until deletion; expiry is unreadable immediately and background maintenance clears retained content. Identity tombstones remain. Deletion does not cancel an already accepted concurrent submission, erase its job or refund charges. Requires read permission plus current key/model/source authorization. A rotated key is resolved only within the saved key lineage. An unrelated key never replaces the original billing source. This GET never polls upstream, reserves funds or submits a job; it reports saved, not_dispatched or dispatched preparation.

Implementation: `implemented`. Operation: `getVideoSubmissionIntent`.

### Supported scope

Text-only durable intent persistence and explicit submission. Full browser restoration and customer-funded video qualification remain open.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

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

`intent` (path, required)

```json
{
  "type": "string",
  "format": "uuid"
}
```

### Responses

HTTP 200: Restore a video intent and resolve its original job

Response header: `Cache-Control`.

```json
{
  "type": "string",
  "const": "no-store"
}
```

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
      "$ref": "#/components/schemas/VideoSubmissionIntent"
    }
  }
}
```

HTTP 400: Invalid path, query or request; framework rejections may be plain text.

HTTP 401: Invalid actor credential or no authorized current key in the original lineage.

HTTP 403: Workspace permission or current source policy denied.

HTTP 404: Intent is not owned by this actor and workspace, or selected model is inaccessible.

HTTP 409: Immutable identity, request, funding mode, revision or cursor conflict.

HTTP 503: Required storage or route configuration is unavailable.

## List the current actor video intent index

`GET /admin/v1/organizations/{organization}/projects/{project}/video-intents`

Actor-owned workspace records: installation authority shares one installation actor, while operator actors are isolated even within the same workspace. Current workspace permission applies. Request content is retained for 30 days from creation or until deletion; expiry is unreadable immediately and background maintenance clears retained content. Identity tombstones remain. Deletion does not cancel an already accepted concurrent submission, erase its job or refund charges. Newest-first creation order with UUID tie-breaker. The index contains only intent identity, revision, expiry and retention state; it intentionally exposes no request, model or key content. Index access remains available for deleting retained content after key revocation. Read each intent separately under current key authorization. A cursor must belong to this actor and workspace.

Implementation: `implemented`. Operation: `listVideoSubmissionIntents`.

### Supported scope

Text-only durable intent persistence and explicit submission. Full browser restoration and customer-funded video qualification remain open.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

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

`before` (query, optional)

```json
{
  "type": "string",
  "format": "uuid"
}
```

`limit` (query, optional)

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 25
}
```

### Responses

HTTP 200: List the current actor video intent index

Response header: `Cache-Control`.

```json
{
  "type": "string",
  "const": "no-store"
}
```

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data",
    "has_more",
    "next_before"
  ],
  "properties": {
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "$ref": "#/components/schemas/VideoIntentIndexItem"
      }
    },
    "has_more": {
      "type": "boolean"
    },
    "next_before": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    }
  }
}
```

HTTP 400: Invalid path, query or request; framework rejections may be plain text.

HTTP 401: Invalid actor credential or no authorized current key in the original lineage.

HTTP 403: Workspace permission or current source policy denied.

HTTP 404: Intent is not owned by this actor and workspace, or selected model is inaccessible.

HTTP 409: Immutable identity, request, funding mode, revision or cursor conflict.

HTTP 503: Required storage or route configuration is unavailable.

## Erase saved intent content without cancelling its job

`DELETE /admin/v1/organizations/{organization}/projects/{project}/video-intents/{intent}`

Actor-owned workspace records: installation authority shares one installation actor, while operator actors are isolated even within the same workspace. Current workspace permission applies. Request content is retained for 30 days from creation or until deletion; expiry is unreadable immediately and background maintenance clears retained content. Identity tombstones remain. Deletion does not cancel an already accepted concurrent submission, erase its job or refund charges. Requires write permission and the expected revision. Replaying the same successful deletion is idempotent. Does not require an active selected key. Deleted identities cannot be saved or submitted again.

Implementation: `implemented`. Operation: `deleteVideoSubmissionIntent`.

### Supported scope

Text-only durable intent persistence and explicit submission. Full browser restoration and customer-funded video qualification remain open.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

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

`intent` (path, required)

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
    "expected_revision"
  ],
  "properties": {
    "expected_revision": {
      "type": "integer",
      "minimum": 1
    }
  }
}
```

### Responses

HTTP 200: Erase saved intent content without cancelling its job

Response header: `Cache-Control`.

```json
{
  "type": "string",
  "const": "no-store"
}
```

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
        "revision",
        "deleted"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "revision": {
          "type": "integer",
          "minimum": 1
        },
        "deleted": {
          "const": true
        }
      }
    }
  }
}
```

HTTP 400: Invalid path, query or request; framework rejections may be plain text.

HTTP 401: Invalid actor credential or no authorized current key in the original lineage.

HTTP 403: Workspace permission or current source policy denied.

HTTP 404: Intent is not owned by this actor and workspace, or selected model is inaccessible.

HTTP 409: Immutable identity, request, funding mode, revision or cursor conflict.

HTTP 503: Required storage or route configuration is unavailable.

## Explicitly submit or replay an immutable saved video intent

`POST /admin/v1/organizations/{organization}/projects/{project}/video-intents/{intent}/submit`

Actor-owned workspace records: installation authority shares one installation actor, while operator actors are isolated even within the same workspace. Current workspace permission applies. Request content is retained for 30 days from creation or until deletion; expiry is unreadable immediately and background maintenance clears retained content. Identity tombstones remain. Deletion does not cancel an already accepted concurrent submission, erase its job or refund charges. Requires write permission, matching retained revision and current key/model/source authorization. Uses only the saved request and original rotation lineage. Rechecks configured video admission and rejects a changed owner-funded/customer funding mode before a new dispatch. Concurrent and restarted calls use one original submission identity. Interrupted original preparation is read back, never assumed safe to dispatch again. HTTP 202 can represent unresolved submission and is not a completed generation or settled charge.

Implementation: `implemented`. Operation: `submitVideoSubmissionIntent`.

### Supported scope

Text-only durable intent persistence and explicit submission. Full browser restoration and customer-funded video qualification remain open.

### Authentication

Each array entry is an alternative; schemes within one entry are required together.

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

`intent` (path, required)

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
    "expected_revision"
  ],
  "properties": {
    "expected_revision": {
      "type": "integer",
      "minimum": 1
    }
  }
}
```

### Responses

HTTP 202: Explicitly submit or replay an immutable saved video intent

Response header: `Cache-Control`.

```json
{
  "type": "string",
  "const": "no-store"
}
```

Content type: `application/json`.

```json
{
  "$ref": "#/paths/~1v1~1video~1jobs~1{id}/get/responses/200/content/application~1json/schema"
}
```

HTTP 400: Invalid path, query or request; framework rejections may be plain text.

HTTP 401: Invalid actor credential or no authorized current key in the original lineage.

HTTP 403: Workspace permission or current source policy denied.

HTTP 404: Intent is not owned by this actor and workspace, or selected model is inaccessible.

HTTP 409: Immutable identity, request, funding mode, revision or cursor conflict.

HTTP 503: Required storage or route configuration is unavailable.

HTTP 501: Unsupported video capability or non-text intent.

HTTP 402: Insufficient funds or spending allowance before dispatch.

HTTP 429: Current rate or concurrency policy denied admission.

## Shared schemas

Local `#/components/schemas/…` references resolve to these definitions.

### ApiErrorResponse

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

### CatalogMetadata

```json
{
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
}
```

### ChatCompletionRequest

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
    "max_tokens": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": 1,
      "maximum": 9223372036854775807
    },
    "max_completion_tokens": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": 1,
      "maximum": 9223372036854775807
    },
    "n": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": 1,
      "maximum": 9223372036854775807
    },
    "seed": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": -9223372036854775808,
      "maximum": 9223372036854775807
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

### ChatCompletionResponse

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

### GatewayActivity

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "attempt_id",
    "operation_id",
    "api_key_id",
    "key_name",
    "task_evidence",
    "model",
    "provider_model",
    "created_at",
    "execution",
    "output_guardrail_outcome",
    "usage_confidence"
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
      ],
      "maxLength": 200
    },
    "task_evidence": {
      "oneOf": [
        {
          "type": "null"
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "execution_id",
            "source",
            "record_id",
            "coverage",
            "outcomes"
          ],
          "properties": {
            "execution_id": {
              "type": "string",
              "format": "uuid",
              "description": "Historical correlation reference; external execution imports are no longer supported."
            },
            "source": {
              "type": "string"
            },
            "record_id": {
              "type": "string"
            },
            "coverage": {
              "type": "string",
              "enum": [
                "complete",
                "partial",
                "unknown"
              ]
            },
            "outcomes": {
              "type": "array",
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "authority",
                  "result"
                ],
                "properties": {
                  "authority": {
                    "type": "string",
                    "enum": [
                      "agent_claim",
                      "deterministic_validator",
                      "human_acceptance"
                    ]
                  },
                  "result": {
                    "type": "string",
                    "enum": [
                      "accepted",
                      "rejected",
                      "inconclusive"
                    ]
                  }
                }
              }
            }
          }
        }
      ]
    },
    "model": {
      "type": "string",
      "description": "Public model alias requested through Niu."
    },
    "request_kind": {
      "type": "string",
      "enum": [
        "video",
        "inference"
      ],
      "description": "Durable video recovery-route identity; model names and pricing alone do not establish video kind."
    },
    "provider_model": {
      "type": [
        "string",
        "null"
      ],
      "description": "Provider-reported model identity when returned by the provider. It is distinct from the public model alias."
    },
    "created_at": {
      "type": "string",
      "format": "date-time"
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
      "minimum": 0,
      "description": "Legacy dispatch-to-completion attempt interval. Prefer timing.total_ms when timing.complete is true for the full measured gateway request interval; interrupted timing must not be treated as completed latency."
    },
    "execution": {
      "type": "string"
    },
    "output_guardrail_outcome": {
      "type": [
        "string",
        "null"
      ],
      "enum": [
        "allowed",
        "redacted",
        "blocked",
        "indeterminate",
        null
      ],
      "description": "Immutable recorded output inspection. Null means no recorded outcome, not successful delivery or content protection. Blocked/indeterminate output is withheld without cancelling incurred usage or customer charges."
    },
    "usage_confidence": {
      "type": "string"
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
      "pattern": "^[0-9]+$",
      "description": "Explicitly reported subset of prompt tokens. Null means unknown."
    },
    "reasoning_output_tokens": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$",
      "description": "Explicitly reported subset of completion tokens. Null means unknown."
    },
    "failure": {
      "oneOf": [
        {
          "type": "null"
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "kind",
            "upstream_http_status"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "upstream_http_error",
                "upstream_region_unavailable",
                "upstream_timeout",
                "upstream_connection_error",
                "upstream_transport_error",
                "upstream_invalid_response"
              ]
            },
            "upstream_http_status": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 100,
              "maximum": 599,
              "description": "Recorded upstream non-success status. Null for transport or invalid-response classifications. This is independent of the HTTP status delivered by Niu."
            }
          }
        }
      ],
      "description": "Content-free immutable upstream diagnosis, independent of payload retention. Null means no recorded classification, not a successful request. Does not establish execution, usage or billing certainty."
    },
    "finish_reasons": {
      "type": [
        "array",
        "null"
      ],
      "description": "Explicit allowlisted terminal observations, independent of payload retention. Chat indexes identify choices. For nonstreaming Responses interruptions, index zero identifies the whole response; max_output_tokens maps to length and content_filter maps to content_filter. Completed Responses status alone supplies no stop reason. Null means unknown; finish reasons do not establish task success or customer delivery.",
      "minItems": 1,
      "maxItems": 128,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "index",
          "reason"
        ],
        "properties": {
          "index": {
            "type": "integer",
            "minimum": 0,
            "maximum": 4294967295
          },
          "reason": {
            "type": "string",
            "enum": [
              "stop",
              "length",
              "tool_calls",
              "content_filter",
              "function_call"
            ]
          }
        }
      }
    },
    "customer_charge_currency": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[A-Z]{3}$"
    },
    "customer_charge_nanos": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$"
    },
    "customer_charge_status": {
      "type": "string",
      "enum": [
        "charged",
        "owner_funded",
        "pending",
        "unpriced",
        "not_charged"
      ]
    },
    "timing": {
      "oneOf": [
        {
          "type": "null"
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "dispatch_ms",
            "headers_ms",
            "first_output_ms",
            "total_ms",
            "complete",
            "http_status"
          ],
          "description": "Monotonic millisecond offsets from gateway request handling. Missing observations stay null; values do not include client network delivery after body consumption. First output means a meaningful streamed Chat event, not a role, keepalive or usage event.",
          "properties": {
            "dispatch_ms": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 0
            },
            "headers_ms": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 0
            },
            "first_output_ms": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 0
            },
            "total_ms": {
              "type": "integer",
              "minimum": 0
            },
            "complete": {
              "type": "boolean",
              "description": "The response body reached EOF without a stream error; not a claim of successful inference."
            },
            "http_status": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 100,
              "maximum": 599
            }
          }
        }
      ]
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

### IssuedWorkspaceKey

```json
{
  "type": "object",
  "required": [
    "id",
    "token"
  ],
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "token": {
      "type": "string",
      "description": "One-time workspace API key secret; store securely. Never present in key metadata reads."
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

### KeyInput

```json
{
  "type": "object",
  "additionalProperties": false,
  "description": "Unknown fields are rejected. Configure per-key customer spending, IP allowlist, rolling request rate, token budgets and concurrent-request limits through their separate key management APIs. Key creation does not set these policies. Workspace and company financial limits still apply; rotation preserves the key lineage policies.",
  "required": [
    "name",
    "ttl_seconds"
  ],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "allowed_models": {
      "type": "array",
      "minItems": 1,
      "default": [
        "*"
      ],
      "description": "Deprecated. Omit to grant every model available to this workspace; explicit aliases are retained for compatibility. The wildcard must be the only entry when used.",
      "items": {
        "type": "string"
      }
    },
    "ttl_seconds": {
      "type": "integer",
      "minimum": 1,
      "maximum": 31536000
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

### ModelRoutePool

```json
{
  "type": "object",
  "required": [
    "alias",
    "organization_id",
    "enabled",
    "revision",
    "candidates"
  ],
  "properties": {
    "alias": {
      "type": "string"
    },
    "organization_id": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    },
    "enabled": {
      "type": "boolean"
    },
    "revision": {
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    },
    "candidates": {
      "type": "array",
      "minItems": 1,
      "maxItems": 64,
      "items": {
        "type": "object",
        "required": [
          "alias",
          "priority",
          "weight",
          "enabled"
        ],
        "properties": {
          "alias": {
            "type": "string"
          },
          "priority": {
            "type": "integer",
            "minimum": -1000,
            "maximum": 1000
          },
          "weight": {
            "type": "integer",
            "minimum": 1,
            "maximum": 10000
          },
          "enabled": {
            "type": "boolean"
          }
        }
      }
    }
  }
}
```

### ProviderCatalogModel

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "name",
    "context_length",
    "catalog"
  ],
  "properties": {
    "catalog": {
      "$ref": "#/components/schemas/CatalogMetadata"
    },
    "id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200,
      "description": "Provider model ID used for inference routing."
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 300,
      "description": "Display name supplied by the provider."
    },
    "context_length": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": 1
    }
  }
}
```

### Vendor

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "name",
    "adapter",
    "api_base",
    "enabled",
    "revision",
    "has_credential"
  ],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "name": {
      "type": "string"
    },
    "adapter": {
      "type": "string",
      "enum": [
        "openrouter",
        "openai"
      ]
    },
    "api_base": {
      "type": "string",
      "format": "uri"
    },
    "enabled": {
      "type": "boolean"
    },
    "revision": {
      "type": "integer",
      "minimum": 1
    },
    "has_credential": {
      "type": "boolean"
    },
    "owner_funded": {
      "type": "boolean",
      "readOnly": true,
      "description": "Configuration-list metadata identifying a private credential owned by one account. Not accepted in configuration writes."
    },
    "supplier": {
      "type": [
        "object",
        "null"
      ],
      "description": "Supplier ownership on configuration-list reads; credentials and commercial data are excluded.",
      "required": [
        "id",
        "name"
      ],
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "name": {
          "type": "string"
        }
      }
    }
  }
}
```

### VendorCapabilities

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "catalog": {
      "$ref": "#/components/schemas/CatalogMetadata"
    },
    "video_schema": {
      "$ref": "#/components/schemas/VideoSchema"
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
    "supports_responses": {
      "type": "boolean",
      "default": false
    }
  }
}
```

### VendorCreate

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "name",
    "adapter",
    "api_base",
    "api_key"
  ],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "adapter": {
      "type": "string",
      "enum": [
        "openrouter",
        "openai"
      ]
    },
    "api_base": {
      "type": "string",
      "format": "uri",
      "maxLength": 2048,
      "description": "HTTPS endpoint or HTTP loopback endpoint without URL credentials or query parameters."
    },
    "api_key": {
      "type": "string",
      "writeOnly": true,
      "minLength": 1,
      "maxLength": 8192
    },
    "enabled": {
      "type": "boolean",
      "default": true
    },
    "supplier_id": {
      "type": "string",
      "format": "uuid",
      "description": "Existing Supplier business to own this API-key configuration. Mutually exclusive with create_supplier=true; ownership and creation commit atomically."
    },
    "create_supplier": {
      "type": "boolean",
      "default": false,
      "description": "Atomically create a Supplier business with this name and its explicit configuration ownership link. Omission preserves legacy configuration-only creation."
    }
  }
}
```

### VendorModel

```json
{
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
      "$ref": "#/components/schemas/VendorCapabilities"
    },
    "pricing": {
      "$ref": "#/components/schemas/VendorRoutePricing"
    },
    "revision": {
      "type": "integer",
      "minimum": 1
    }
  }
}
```

### VendorModelInput

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
      "$ref": "#/components/schemas/VendorCapabilities"
    },
    "pricing": {
      "$ref": "#/components/schemas/VendorRoutePricing",
      "description": "Optional validated route pricing. Personal-owned credentials require null pricing; non-null pricing is rejected at save. Null clears pricing; omission preserves existing pricing on updates and leaves cost unknown on creates."
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

### VendorRoutePricing

```json
{
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
}
```

### VendorUpdate

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "name",
    "api_base",
    "enabled",
    "expected_revision"
  ],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "api_base": {
      "type": "string",
      "format": "uri",
      "maxLength": 2048
    },
    "api_key": {
      "type": "string",
      "writeOnly": true,
      "minLength": 1,
      "maxLength": 8192,
      "description": "Omit to retain the current credential."
    },
    "enabled": {
      "type": "boolean"
    },
    "expected_revision": {
      "type": "integer",
      "minimum": 1
    }
  }
}
```

### VideoBillingQuantity

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "numerator",
    "denominator"
  ],
  "properties": {
    "numerator": {
      "type": "string",
      "pattern": "^[0-9]+$"
    },
    "denominator": {
      "type": "string",
      "pattern": "^[1-9][0-9]*$"
    }
  }
}
```

### VideoBooleanControl

```json
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
```

### VideoChoiceControl

```json
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
}
```

### VideoHttpsControl

```json
{
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
```

### VideoInputRule

```json
{
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
```

### VideoIntegerControl

```json
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
}
```

### VideoIntentIndexItem

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "revision",
    "expires_at_ms",
    "content_state"
  ],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "revision": {
      "type": "integer",
      "minimum": 1
    },
    "expires_at_ms": {
      "type": "string",
      "pattern": "^[0-9]+$"
    },
    "content_state": {
      "type": "string",
      "enum": [
        "retained",
        "deleted",
        "expired"
      ]
    }
  }
}
```

### VideoIntentRequest

```json
{
  "type": "object",
  "required": [
    "model",
    "content"
  ],
  "additionalProperties": true,
  "description": "Validated text-only request with configured defaults materialized at save time, at most 60 KiB encoded JSON. Model-specific controls must satisfy the current configured video schema; image/media references and callbacks are unsupported. Saving validates availability and funding mode but does not reserve funds.",
  "properties": {
    "model": {
      "type": "string"
    },
    "content": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "type",
          "text"
        ],
        "properties": {
          "type": {
            "const": "text"
          },
          "text": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

### VideoJobBilling

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "mode",
    "state",
    "currency",
    "reserved_nanos",
    "charge_nanos",
    "usage",
    "price",
    "bound_exceeded",
    "effective_output",
    "estimate"
  ],
  "properties": {
    "mode": {
      "type": "string",
      "enum": [
        "owner_funded",
        "customer",
        "unavailable"
      ]
    },
    "state": {
      "type": "string",
      "enum": [
        "owner_funded",
        "unavailable",
        "reserved",
        "awaiting_usage",
        "awaiting_settlement",
        "settled",
        "reconciliation_required"
      ]
    },
    "currency": {
      "type": [
        "string",
        "null"
      ]
    },
    "reserved_nanos": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$"
    },
    "charge_nanos": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$"
    },
    "settled_usage": {
      "type": [
        "object",
        "null"
      ],
      "additionalProperties": false,
      "description": "Immutable quantity behind a posted customer charge, distinct from later usage observations or conflicts.",
      "required": [
        "meter",
        "quantity",
        "billable_quantity",
        "provenance"
      ],
      "properties": {
        "meter": {
          "type": "string"
        },
        "quantity": {
          "$ref": "#/components/schemas/VideoBillingQuantity"
        },
        "billable_quantity": {
          "$ref": "#/components/schemas/VideoBillingQuantity"
        },
        "provenance": {
          "type": "string",
          "enum": [
            "Reported"
          ]
        }
      }
    },
    "bound_exceeded": {
      "type": [
        "boolean",
        "null"
      ]
    },
    "effective_output": {
      "type": [
        "object",
        "null"
      ],
      "additionalProperties": false,
      "description": "Immutable effective output from submission; absent for legacy jobs. Revisions identify calculation evidence, not current availability.",
      "required": [
        "specification",
        "duration_seconds",
        "frames_per_second",
        "schema_revision",
        "estimator",
        "estimator_revision"
      ],
      "properties": {
        "specification": {
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
              "type": "string"
            },
            "ratio": {
              "type": "string"
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
        },
        "duration_seconds": {
          "type": "integer",
          "minimum": 1
        },
        "frames_per_second": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 1,
          "maximum": 4294967295,
          "description": "Null when the seconds estimator has no configured frame rate; required for pixel-based estimation."
        },
        "schema_revision": {
          "type": "string"
        },
        "estimator": {
          "type": "string",
          "enum": [
            "SeedancePixelsV1",
            "OutputSecondsV1"
          ]
        },
        "estimator_revision": {
          "type": "string"
        }
      }
    },
    "estimate": {
      "type": [
        "object",
        "null"
      ],
      "additionalProperties": false,
      "description": "Saved estimated quantity priced using the original customer tariff. Neither confirmed usage, maximum liability nor a final charge. Owner-funded or unpriceable amounts remain null.",
      "required": [
        "meter",
        "quantity",
        "provenance",
        "currency",
        "amount_nanos"
      ],
      "properties": {
        "meter": {
          "type": "string"
        },
        "quantity": {
          "$ref": "#/components/schemas/VideoBillingQuantity"
        },
        "provenance": {
          "type": "string",
          "enum": [
            "Estimate"
          ]
        },
        "currency": {
          "type": [
            "string",
            "null"
          ]
        },
        "amount_nanos": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[0-9]+$"
        }
      }
    },
    "usage": {
      "type": [
        "object",
        "null"
      ],
      "additionalProperties": false,
      "required": [
        "meter",
        "quantity"
      ],
      "properties": {
        "meter": {
          "type": "string"
        },
        "quantity": {
          "$ref": "#/components/schemas/VideoBillingQuantity"
        }
      }
    },
    "price": {
      "type": [
        "object",
        "null"
      ],
      "additionalProperties": false,
      "required": [
        "meter",
        "amount_units",
        "decimal_places",
        "per_quantity",
        "minimum_quantity",
        "rounding",
        "resolution",
        "reference_video",
        "effective_from",
        "effective_until",
        "discounts"
      ],
      "properties": {
        "meter": {
          "type": "string"
        },
        "amount_units": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "decimal_places": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9
        },
        "per_quantity": {
          "$ref": "#/components/schemas/VideoBillingQuantity"
        },
        "minimum_quantity": {
          "$ref": "#/components/schemas/VideoBillingQuantity"
        },
        "rounding": {
          "type": "string",
          "enum": [
            "Down",
            "Up",
            "HalfEven"
          ]
        },
        "resolution": {
          "type": "string"
        },
        "reference_video": {
          "type": "boolean"
        },
        "effective_from": {
          "type": "string",
          "pattern": "^-?[0-9]+$"
        },
        "effective_until": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^-?[0-9]+$"
        },
        "discounts": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "multiplier",
              "stacking",
              "effective_from",
              "effective_until"
            ],
            "properties": {
              "multiplier": {
                "$ref": "#/components/schemas/VideoBillingQuantity"
              },
              "stacking": {
                "type": "string",
                "enum": [
                  "Exclusive",
                  "Multiply"
                ]
              },
              "effective_from": {
                "type": "string",
                "pattern": "^-?[0-9]+$"
              },
              "effective_until": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^-?[0-9]+$"
              }
            }
          }
        }
      }
    }
  }
}
```

### VideoOutputSchema

```json
{
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
```

### VideoSchema

```json
{
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
          "$ref": "#/components/schemas/VideoInputRule"
        },
        "image_url": {
          "$ref": "#/components/schemas/VideoInputRule"
        },
        "video_url": {
          "$ref": "#/components/schemas/VideoInputRule"
        },
        "audio_url": {
          "$ref": "#/components/schemas/VideoInputRule"
        }
      }
    },
    "controls": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "duration": {
          "$ref": "#/components/schemas/VideoIntegerControl"
        },
        "seed": {
          "$ref": "#/components/schemas/VideoIntegerControl"
        },
        "frames_per_second": {
          "$ref": "#/components/schemas/VideoIntegerControl"
        },
        "resolution": {
          "$ref": "#/components/schemas/VideoChoiceControl"
        },
        "ratio": {
          "$ref": "#/components/schemas/VideoChoiceControl"
        },
        "watermark": {
          "$ref": "#/components/schemas/VideoBooleanControl"
        },
        "camera_fixed": {
          "$ref": "#/components/schemas/VideoBooleanControl"
        },
        "return_last_frame": {
          "$ref": "#/components/schemas/VideoBooleanControl"
        },
        "callback_url": {
          "$ref": "#/components/schemas/VideoHttpsControl"
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
      "$ref": "#/components/schemas/VideoOutputSchema"
    },
    "callbacks_qualified": {
      "type": "boolean",
      "description": "Required for a callback_url declaration; separate adapter/offer qualification and callback authentication still apply."
    }
  }
}
```

### VideoSubmissionIntent

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "revision",
    "original_key_id",
    "key_id",
    "model",
    "funding_mode",
    "request",
    "content_state",
    "expires_at_ms",
    "submission_state",
    "job"
  ],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "revision": {
      "type": "integer",
      "minimum": 1
    },
    "expires_at_ms": {
      "type": "string",
      "pattern": "^[0-9]+$"
    },
    "content_state": {
      "type": "string",
      "enum": [
        "retained",
        "deleted",
        "expired"
      ]
    },
    "original_key_id": {
      "type": "string",
      "format": "uuid"
    },
    "key_id": {
      "type": "string",
      "format": "uuid",
      "description": "Current active key in the original rotation lineage; no secret is returned."
    },
    "model": {
      "type": "string"
    },
    "funding_mode": {
      "type": "string",
      "enum": [
        "owner_funded",
        "customer"
      ]
    },
    "request": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/VideoIntentRequest"
        },
        {
          "type": "null"
        }
      ]
    },
    "submission_state": {
      "type": "string",
      "enum": [
        "saved",
        "not_dispatched",
        "dispatched"
      ],
      "description": "Dispatch and job status are read from one database statement snapshot. not_dispatched means original preparation has no recorded dispatch; it never grants a fresh submission right."
    },
    "job": {
      "anyOf": [
        {
          "$ref": "#/paths/~1v1~1video~1jobs~1{id}/get/responses/200/content/application~1json/schema"
        },
        {
          "type": "null"
        }
      ]
    }
  }
}
```

### WorkspaceKey

```json
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
    "expired"
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
      "type": "integer",
      "format": "int64"
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
    }
  }
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

## Authentication schemes

### bearerAuth

```json
{
  "type": "http",
  "scheme": "bearer"
}
```

### niuApiKeyAuth

```json
{
  "type": "apiKey",
  "in": "header",
  "name": "X-Niu-API-Key"
}
```
