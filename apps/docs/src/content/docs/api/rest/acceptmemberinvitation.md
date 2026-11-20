---
title: "Accept a one-time member invitation"
description: "POST /api/v1/session/invitations"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/session/invitations`

Authenticated member session required; installation credentials are rejected. Atomically revalidates invitation state, expiry, version, email binding, inviter authority and target scope, then creates the exact invited member role/scope for the caller's account identity and switches the current session to it. No reusable operator access token is issued. The redemption secret is consumed exactly once. Replay by the same account identity returns the completed membership with replayed true; another identity is denied. Existing operator sessions and roles are not broadened. Returns the refreshed session plus accepted invitation metadata. Responses are not cached.

Operation: `acceptMemberInvitation`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/session/invitations" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

No path, query, or header parameters are declared.

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "token"
  ],
  "properties": {
    "token": {
      "type": "string",
      "minLength": 20,
      "maxLength": 512,
      "description": "One-time invitation secret."
    }
  }
}
```

## Responses

### HTTP 200

Invitation accepted or reconciled; the refreshed session is scoped to the invited role and workspace.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "invitation",
    "replayed"
  ],
  "properties": {
    "data": {
      "type": "object",
      "description": "Refreshed session identity."
    },
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
    "replayed": {
      "type": "boolean"
    }
  }
}
```

### HTTP 400

Malformed invitation token.

### HTTP 403

Signed-in account email does not match the invitation, or the inviter no longer has authority.

### HTTP 404

Invitation is invalid, expired, canceled or already used by another identity.

### HTTP 409

The account already belongs to the organization; change the existing member instead.

### HTTP 413

Body exceeds the bounded request size.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Authenticated member session required; installation credentials are rejected. Atomically revalidates invitation state, expiry, version, email binding, inviter authority and target scope, then creates the exact invited member role/scope for the caller's account identity and switches the current session to it. No reusable operator access token is issued. The redemption secret is consumed exactly once. Replay by the same account identity returns the completed membership with replayed true; another identity is denied. Existing operator sessions and roles are not broadened. Returns the refreshed session plus accepted invitation metadata. Responses are not cached.

**Supported scope:** implemented
