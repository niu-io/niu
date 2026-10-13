---
title: "List saved workspace API-key metadata"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/keys"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/keys`

Requires workspace read access. Workspace API keys do not authorize these management operations. Returns the complete saved directory in creation-time/routing-reference order; this compatibility response has no continuation cursor. Storage reads use transaction-local 250 ms lock and 2 s statement limits. Timeout returns sanitized 503, never empty or truncated success; pool admission and the complete HTTP deadline are separate. Internal IDs are API routing references, not product labels. Supplying limit or after selects a bounded keyset page and adds next_cursor; without either, the complete compatibility response is unchanged.

Operation: `listKeys`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/keys" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
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

### limit

Location: **query**. Optional. Explicit limit selects paginated mode (1 to 100). With after but no limit, page size is 50. Omit both for the full compatibility directory.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100
}
```

### after

Location: **query**. Optional. Exclusive key routing reference from next_cursor. Missing or foreign-workspace cursors return 409. Each page shares one snapshot with its cursor lookup; traversal is a live view.

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

Scoped metadata, never token hashes or secrets. Last used is the latest durable dispatch intent, including uncertain attempts; it is not authentication time or proof of upstream completion.

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
          }
        }
      }
    },
    "next_cursor": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid",
      "description": "Present only when limit or after is supplied. Null when the paginated range ends. Internal routing reference, not a product label."
    }
  }
}
```

### HTTP 400

Invalid limit or cursor syntax.

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

Missing or foreign-workspace cursor.

## Behavior and supported scope

Requires workspace read access. Workspace API keys do not authorize these management operations. Returns the complete saved directory in creation-time/routing-reference order; this compatibility response has no continuation cursor. Storage reads use transaction-local 250 ms lock and 2 s statement limits. Timeout returns sanitized 503, never empty or truncated success; pool admission and the complete HTTP deadline are separate. Internal IDs are API routing references, not product labels. Supplying limit or after selects a bounded keyset page and adds next_cursor; without either, the complete compatibility response is unchanged.

**Supported scope:** implemented
