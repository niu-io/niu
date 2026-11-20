---
title: "Reconcile an incident event in the current workspace"
description: "GET /v1/incidents/{reference}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/incidents/{reference}`

Requires a current workspace key with events:read. The opaque reference is unique to the affected workspace. Returns that workspace's model, whether its connection is owner-funded, current incident state, recovery time and the current lifecycle event's durable notification state for this exact workspace. notification reports not_configured, authority_inactive, queued, sending, delivered, failed or partial from enabled incident subscriptions and current delegation; a 2xx receiver acknowledgement is not processing or task success. No upstream connection, credentials, request content, procurement data or other workspace identity. Historical references remain readable after recovery. A missing or foreign reference returns 404. The event signals a specific incident, not current health of all models or Provider supply. No inference or notification is sent. Cache-Control no-store.

Operation: `getWorkspaceIncidentEvent`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/incidents/{reference}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### reference

Location: **path**. **Required.**

```json
{
  "type": "string",
  "pattern": "^incident-[0-9a-f]{32}$"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Workspace-scoped incident

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
        "reference",
        "model",
        "owner_funded",
        "status",
        "recovered_at",
        "notification"
      ],
      "properties": {
        "reference": {
          "type": "string"
        },
        "model": {
          "type": "string"
        },
        "owner_funded": {
          "type": "boolean"
        },
        "status": {
          "type": "string",
          "enum": [
            "active",
            "resolved"
          ]
        },
        "recovered_at": {
          "type": [
            "string",
            "null"
          ],
          "format": "date-time"
        },
        "notification": {
          "type": "object",
          "required": [
            "state",
            "event",
            "subscribers",
            "authorized",
            "delivered",
            "failed",
            "cancelled",
            "queued",
            "sending",
            "last_attempt_at"
          ],
          "properties": {
            "state": {
              "type": "string",
              "enum": [
                "not_configured",
                "authority_inactive",
                "queued",
                "sending",
                "delivered",
                "failed",
                "partial"
              ]
            },
            "event": {
              "type": "string",
              "enum": [
                "opened",
                "resolved"
              ]
            },
            "subscribers": {
              "type": "integer",
              "minimum": 0
            },
            "authorized": {
              "type": "integer",
              "minimum": 0
            },
            "delivered": {
              "type": "integer",
              "minimum": 0
            },
            "failed": {
              "type": "integer",
              "minimum": 0
            },
            "cancelled": {
              "type": "integer",
              "minimum": 0
            },
            "queued": {
              "type": "integer",
              "minimum": 0
            },
            "sending": {
              "type": "integer",
              "minimum": 0
            },
            "last_attempt_at": {
              "type": [
                "string",
                "null"
              ],
              "format": "date-time"
            }
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid reference

### HTTP 401

Authentication required

### HTTP 403

events:read required

### HTTP 404

Incident unavailable

### HTTP 503

Evidence unavailable

## Behavior and supported scope

Requires a current workspace key with events:read. The opaque reference is unique to the affected workspace. Returns that workspace's model, whether its connection is owner-funded, current incident state, recovery time and the current lifecycle event's durable notification state for this exact workspace. notification reports not_configured, authority_inactive, queued, sending, delivered, failed or partial from enabled incident subscriptions and current delegation; a 2xx receiver acknowledgement is not processing or task success. No upstream connection, credentials, request content, procurement data or other workspace identity. Historical references remain readable after recovery. A missing or foreign reference returns 404. The event signals a specific incident, not current health of all models or Provider supply. No inference or notification is sent. Cache-Control no-store.

**Supported scope:** implemented
