---
title: "Read platform upstream connection incidents"
description: "GET /api/v1/incidents"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/incidents`

Platform administration only. Reads recognized model-scoped upstream incidents, including repeated 5xx or connection/timeout failures within five minutes, across connections, with their meaningful connection name and optional Provider name/slug. Includes sanitized incident evidence only. Filter active or resolved and follow next_before for at most 50 results per page. No upstream calls, configuration changes or financial mutations. Cache-Control no-store. An empty result means no covered incidents are recorded, not proof of healthy supply. coverage.proactive_probe is not_configured: Niu opens incidents only from observed requests, not from idle-connection health probes, so this view cannot certify an unrequested connection as healthy.

Operation: `listConnectionIncidents`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/incidents" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### status

Location: **query**. Optional.

```json
{
  "type": "string",
  "enum": [
    "active",
    "resolved"
  ]
}
```

### before

Location: **query**. Optional.

```json
{
  "type": "string",
  "pattern": "^incident-[1-9][0-9]*$"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Sanitized connection incident page

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_before",
    "coverage"
  ],
  "properties": {
    "coverage": {
      "type": "object",
      "required": [
        "request_observed",
        "proactive_probe"
      ],
      "properties": {
        "request_observed": {
          "type": "boolean",
          "const": true
        },
        "proactive_probe": {
          "type": "string",
          "const": "not_configured"
        }
      }
    },
    "next_before": {
      "type": [
        "string",
        "null"
      ]
    },
    "data": {
      "type": "array",
      "maxItems": 50,
      "items": {
        "type": "object",
        "required": [
          "reference",
          "model",
          "cause",
          "status",
          "first_observed_at",
          "last_observed_at",
          "observations",
          "recovered_at",
          "connection_name",
          "provider",
          "notifications"
        ],
        "properties": {
          "reference": {
            "type": "string"
          },
          "model": {
            "type": "string"
          },
          "connection_name": {
            "type": "string"
          },
          "cause": {
            "type": "string",
            "enum": [
              "account_restricted",
              "authentication_rejected",
              "repeated_upstream_failures"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "active",
              "resolved"
            ]
          },
          "first_observed_at": {
            "type": "string",
            "format": "date-time"
          },
          "last_observed_at": {
            "type": "string",
            "format": "date-time"
          },
          "observations": {
            "type": "string",
            "pattern": "^[1-9][0-9]*$"
          },
          "recovered_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "provider": {
            "type": [
              "object",
              "null"
            ],
            "required": [
              "name",
              "slug"
            ],
            "properties": {
              "name": {
                "type": "string"
              },
              "slug": {
                "type": "string"
              }
            }
          },
          "notifications": {
            "type": "object",
            "required": [
              "state",
              "workspaces",
              "delivered",
              "failed",
              "cancelled",
              "queued",
              "sending",
              "not_configured",
              "authority_inactive"
            ],
            "properties": {
              "state": {
                "type": "string",
                "enum": [
                  "delivered",
                  "incomplete",
                  "failed",
                  "sending",
                  "queued",
                  "no_recipients"
                ]
              },
              "workspaces": {
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
              "not_configured": {
                "type": "integer",
                "minimum": 0
              },
              "authority_inactive": {
                "type": "integer",
                "minimum": 0
              }
            }
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid filter or cursor

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 503

Incident evidence unavailable

## Behavior and supported scope

Platform administration only. Reads recognized model-scoped upstream incidents, including repeated 5xx or connection/timeout failures within five minutes, across connections, with their meaningful connection name and optional Provider name/slug. Includes sanitized incident evidence only. Filter active or resolved and follow next_before for at most 50 results per page. No upstream calls, configuration changes or financial mutations. Cache-Control no-store. An empty result means no covered incidents are recorded, not proof of healthy supply. coverage.proactive_probe is not_configured: Niu opens incidents only from observed requests, not from idle-connection health probes, so this view cannot certify an unrequested connection as healthy.

**Supported scope:** implemented
