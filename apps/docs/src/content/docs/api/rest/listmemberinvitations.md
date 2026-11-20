---
title: "List scoped member invitations"
description: "GET /api/v1/organizations/{organization}/invitations"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/invitations`

Current organization Owner or installation administrator only. Returns at most 100 recent invitations visible in the caller's scope: project-scoped Owners see only their workspace's invitations, while organization-wide authority sees organization-wide and workspace invitations. Redemption secrets and token digests are never returned. Status is derived from acceptance, cancellation and current expiry.

Operation: `listMemberInvitations`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/invitations" \
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

## Request body

No request body is declared.

## Responses

### HTTP 200

Scoped invitation metadata without secrets.

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
      }
    }
  }
}
```

### HTTP 403

Member management requires organization Owner authority.

### HTTP 404

Organization is outside the caller's scope.

### HTTP 503

Storage unavailable.

## Behavior and supported scope

Current organization Owner or installation administrator only. Returns at most 100 recent invitations visible in the caller's scope: project-scoped Owners see only their workspace's invitations, while organization-wide authority sees organization-wide and workspace invitations. Redemption secrets and token digests are never returned. Status is derived from acceptance, cancellation and current expiry.

**Supported scope:** implemented
