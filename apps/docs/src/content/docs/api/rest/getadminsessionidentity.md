---
title: "Read the current administrator's scope and permissions"
description: "GET /api/v1/session"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/session`

Revalidates the bearer credential on every request. Returns installation authority or the operator's current organization/workspace scope and role. Permissions are UI hints; every management operation independently enforces authorization. Responses contain no credentials and use Cache-Control no-store.

Operation: `getAdminSessionIdentity`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/session" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Current identity and effective role permissions.

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
        "kind",
        "operator",
        "permissions",
        "provider_memberships"
      ],
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "installation",
            "operator"
          ]
        },
        "operating_mode": {
          "type": "string",
          "enum": [
            "internal",
            "resale"
          ],
          "description": "Deployment-wide NIU_OPERATING_MODE policy. Missing configuration defaults to internal; only explicit resale enables commercial operation. Read-only in the dashboard; independent of live/test payments and not an end-user BYOK grant."
        },
        "roles": {
          "type": "object",
          "required": [
            "available",
            "active",
            "switchable"
          ],
          "properties": {
            "available": {
              "type": "array",
              "items": {
                "type": "string",
                "enum": [
                  "user",
                  "admin"
                ]
              },
              "description": "Only identities currently granted to this session. Provider is not a supported login role."
            },
            "active": {
              "type": "string",
              "enum": [
                "user",
                "admin"
              ]
            },
            "switchable": {
              "type": "boolean",
              "description": "Whether this browser sign-in may select another role."
            }
          }
        },
        "admin_mode": {
          "type": "object",
          "required": [
            "available",
            "enabled"
          ],
          "properties": {
            "available": {
              "type": "boolean",
              "description": "Whether this browser sign-in has a current platform administrator grant."
            },
            "enabled": {
              "type": "boolean",
              "description": "Whether platform authority is activated for this browser session."
            }
          }
        },
        "provider_memberships": {
          "type": "array",
          "description": "Retired compatibility field; always empty. Provider membership is not a login role or an access grant.",
          "items": {
            "type": "object",
            "required": [
              "id",
              "name",
              "role"
            ],
            "properties": {
              "id": {
                "type": "string",
                "format": "uuid"
              },
              "name": {
                "type": "string"
              },
              "role": {
                "type": "string",
                "enum": [
                  "viewer",
                  "manager"
                ]
              }
            }
          }
        },
        "operator": {
          "type": [
            "object",
            "null"
          ],
          "required": [
            "id",
            "role",
            "organization_id",
            "project_id"
          ],
          "properties": {
            "id": {
              "type": "string",
              "format": "uuid"
            },
            "role": {
              "type": "string",
              "enum": [
                "owner",
                "admin",
                "viewer"
              ]
            },
            "organization_id": {
              "type": "string",
              "format": "uuid"
            },
            "project_id": {
              "type": [
                "string",
                "null"
              ],
              "format": "uuid"
            }
          }
        },
        "permissions": {
          "type": "object",
          "required": [
            "read",
            "write",
            "manage_operators",
            "platform_admin"
          ],
          "properties": {
            "read": {
              "type": "boolean"
            },
            "write": {
              "type": "boolean"
            },
            "manage_operators": {
              "type": "boolean"
            },
            "platform_admin": {
              "type": "boolean",
              "description": "Explicit platform administration capability; does not expand customer workspace scope."
            }
          }
        }
      }
    }
  }
}
```

### HTTP 401

Missing, invalid, expired or revoked administrator credential.

### HTTP 503

Operator storage is unavailable.

## Behavior and supported scope

Revalidates the bearer credential on every request. Returns installation authority or the operator's current organization/workspace scope and role. Permissions are UI hints; every management operation independently enforces authorization. Responses contain no credentials and use Cache-Control no-store.
