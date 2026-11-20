---
title: "Create a one-time member invitation"
description: "POST /api/v1/organizations/{organization}/invitations"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/invitations`

Current organization Owner or installation administrator only. Creates a short-lived, purpose-bound invitation for one email, role and workspace/organization scope. The response returns the redemption token exactly once and stores only its SHA-256 digest. A new invitation for the same organization, workspace and email replaces any earlier pending invitation, invalidating its link. This installation has no configured email provider: delivery is `not_configured`, no email is sent, and the owner receives a copyable one-time link. The invitation cannot grant broader rights than the caller may assign, and an email that already has active access in the organization is rejected. No reusable access token or session is created. Responses are not cached.

Operation: `createMemberInvitation`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/invitations" \
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "email",
    "role"
  ],
  "properties": {
    "email": {
      "type": "string",
      "maxLength": 254,
      "description": "Intended recipient email. Acceptance requires the signed-in account email to match."
    },
    "name": {
      "type": [
        "string",
        "null"
      ],
      "maxLength": 200,
      "description": "Optional member display name; defaults to the recipient account name."
    },
    "role": {
      "type": "string",
      "enum": [
        "owner",
        "admin",
        "viewer"
      ]
    },
    "project_id": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid",
      "description": "Workspace scope; null grants organization-wide access and requires organization-wide authority."
    },
    "expires_in_seconds": {
      "type": "integer",
      "minimum": 3600,
      "maximum": 2592000,
      "default": 604800
    }
  }
}
```

## Responses

### HTTP 201

Invitation created; the redemption token is returned once.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "invitation",
    "token",
    "accept_path",
    "delivery"
  ],
  "properties": {
    "invitation": {
      "type": "object",
      "required": [
        "id",
        "organization_id",
        "organization_name",
        "organization_slug",
        "project_id",
        "project_name",
        "project_slug",
        "role",
        "recipient_email",
        "recipient_name",
        "status",
        "delivery",
        "created_at",
        "expires_at",
        "accepted_at",
        "revoked_at",
        "invited_by"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "organization_id": {
          "type": "string",
          "format": "uuid"
        },
        "organization_name": {
          "type": "string"
        },
        "organization_slug": {
          "type": "string"
        },
        "project_id": {
          "type": [
            "string",
            "null"
          ],
          "format": "uuid"
        },
        "project_name": {
          "type": [
            "string",
            "null"
          ]
        },
        "project_slug": {
          "type": [
            "string",
            "null"
          ]
        },
        "role": {
          "type": "string",
          "enum": [
            "owner",
            "admin",
            "viewer"
          ]
        },
        "recipient_email": {
          "type": "string"
        },
        "recipient_name": {
          "type": [
            "string",
            "null"
          ]
        },
        "status": {
          "type": "string",
          "enum": [
            "pending",
            "expired",
            "canceled",
            "accepted"
          ]
        },
        "delivery": {
          "type": "string",
          "enum": [
            "not_configured"
          ],
          "description": "No email provider is configured; the one-time link is the supported delivery."
        },
        "created_at": {
          "type": "string",
          "format": "date-time"
        },
        "expires_at": {
          "type": "string",
          "format": "date-time"
        },
        "accepted_at": {
          "type": [
            "string",
            "null"
          ],
          "format": "date-time"
        },
        "revoked_at": {
          "type": [
            "string",
            "null"
          ],
          "format": "date-time"
        },
        "invited_by": {
          "type": [
            "string",
            "null"
          ],
          "description": "Inviting member name; null for installation administration."
        }
      }
    },
    "token": {
      "type": "string",
      "description": "Returned once; only the digest is stored."
    },
    "accept_path": {
      "type": "string",
      "description": "Relative dashboard path for the one-time link."
    },
    "delivery": {
      "type": "object",
      "required": [
        "state",
        "email_sent"
      ],
      "properties": {
        "state": {
          "type": "string",
          "enum": [
            "not_configured"
          ]
        },
        "email_sent": {
          "type": "boolean",
          "const": false
        }
      }
    }
  }
}
```

### HTTP 400

Invalid email, role, scope or expiry.

### HTTP 403

Member management requires organization Owner authority.

### HTTP 404

Organization or workspace is outside the caller's scope.

### HTTP 409

The email already belongs to an active member of this organization.

### HTTP 413

Body exceeds the bounded request size.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Current organization Owner or installation administrator only. Creates a short-lived, purpose-bound invitation for one email, role and workspace/organization scope. The response returns the redemption token exactly once and stores only its SHA-256 digest. A new invitation for the same organization, workspace and email replaces any earlier pending invitation, invalidating its link. This installation has no configured email provider: delivery is `not_configured`, no email is sent, and the owner receives a copyable one-time link. The invitation cannot grant broader rights than the caller may assign, and an email that already has active access in the organization is rejected. No reusable access token or session is created. Responses are not cached.

**Supported scope:** implemented
