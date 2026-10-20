---
title: "Issue a workspace API key and return its secret once"
description: "POST /api/v1/organizations/{organization}/projects/{project}/keys"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/projects/{project}/keys`

Requires workspace write access. Workspace API keys do not authorize these management operations. Grants must be visible model aliases, or the wildcard * as the sole grant. The token is returned only in this response. ttl_seconds is required; explicit null opts into no automatic expiration. Finite integer lifetimes retain their existing range.

Operation: `issueKey`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/keys" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### organization

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### project

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
      "type": [
        "integer",
        "null"
      ],
      "minimum": 1,
      "maximum": 31536000,
      "description": "Required. Integer 1 to 31536000 sets a finite lifetime; explicit null creates a key without automatic expiration. Missing, zero or negative values are rejected. Revocation and all lineage limits still apply."
    }
  }
}
```

## Responses

### HTTP 201

Issued key identity and one-time secret.

Response headers:

```json
{
  "Cache-Control": {
    "description": "Secrets must not be cached.",
    "schema": {
      "type": "string",
      "const": "no-store"
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

### HTTP 400

Invalid fields, model grants, name or lifetime.

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
  "type": "string",
  "description": "Framework path or JSON syntax rejection may use a plain-text body instead of the application error envelope."
}
```

### HTTP 401

Invalid or expired administrative credential.

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

Workspace write permission required.

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

Workspace outside authorized scope.

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

Requires workspace write access. Workspace API keys do not authorize these management operations. Grants must be visible model aliases, or the wildcard * as the sole grant. The token is returned only in this response. ttl_seconds is required; explicit null opts into no automatic expiration. Finite integer lifetimes retain their existing range.

**Supported scope:** implemented
