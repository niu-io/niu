---
title: "Update workspace API key name and model grants"
description: "PATCH /admin/v1/organizations/{organization}/projects/{project}/keys/{key}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PATCH /admin/v1/organizations/{organization}/projects/{project}/keys/{key}`

Requires workspace write access. Changes the saved name and model grants without returning or rotating the secret or extending expiry. Subsequent requests use the current grants; this does not cancel already dispatched requests. expected_revision is an integer, unlike decimal-string policy revisions. A no-op edit retains its revision; a changed edit increments it. Model aliases must exist in the authorized scope. The wildcard must be the sole grant.

Operation: `updateKeyMetadata`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X PATCH "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/keys/{key}" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
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

## Responses

### HTTP 200

Current metadata revision; no secret is returned

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

### HTTP 400

Invalid name, model grants or revision

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

Authentication required

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

Write permission required

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

Workspace access not granted

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

Stale revision, missing key, revoked key or expired key

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

### HTTP 422

Invalid JSON shape, missing or unknown fields

### HTTP 503

Durable storage unavailable

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

Requires workspace write access. Changes the saved name and model grants without returning or rotating the secret or extending expiry. Subsequent requests use the current grants; this does not cancel already dispatched requests. expected_revision is an integer, unlike decimal-string policy revisions. A no-op edit retains its revision; a changed edit increments it. Model aliases must exist in the authorized scope. The wildcard must be the sole grant.

**Supported scope:** implemented
