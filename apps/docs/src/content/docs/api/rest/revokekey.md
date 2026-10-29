---
title: "Revoke a workspace API key"
description: "DELETE /api/v1/organizations/{organization}/projects/{project}/keys/{key}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /api/v1/organizations/{organization}/projects/{project}/keys/{key}`

Requires workspace write access. Workspace API keys do not authorize these management operations.

Operation: `revokeKey`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/keys/{key}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
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

No request body is declared.

## Responses

### HTTP 204

Key revoked, including an already revoked key.

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

### HTTP 409

Key does not exist in this project.

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

Requires workspace write access. Workspace API keys do not authorize these management operations.

**Supported scope:** implemented
