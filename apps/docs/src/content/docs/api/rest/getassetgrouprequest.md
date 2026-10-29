---
title: "Read customer-safe asset request content and retention status"
description: "GET /api/v1/organizations/{organization}/projects/{project}/asset-group-intents/{intent}/request"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/asset-group-intents/{intent}/request`

Requires workspace read permission. Returns null for absent intents. Expired or deleted request content is hidden immediately. Account bindings, credential revisions, fingerprints and procurement data are excluded.

Operation: `getAssetGroupRequest`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/asset-group-intents/{intent}/request" \
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

### intent

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

Customer-safe detail or null; Cache-Control no-store.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": [
        "object",
        "null"
      ],
      "additionalProperties": false,
      "required": [
        "status",
        "created_at",
        "request_content_status",
        "request",
        "dispatch"
      ],
      "properties": {
        "dispatch": {
          "type": [
            "object",
            "null"
          ],
          "additionalProperties": false,
          "required": [
            "outcome",
            "reason",
            "duration_ms"
          ],
          "properties": {
            "outcome": {
              "type": "string",
              "enum": [
                "succeeded",
                "uncertain"
              ]
            },
            "reason": {
              "type": [
                "string",
                "null"
              ],
              "enum": [
                "invalid_configuration",
                "destination_rejected",
                "upstream_uncertain",
                "timeout",
                null
              ]
            },
            "duration_ms": {
              "type": "integer",
              "minimum": 0,
              "description": "Measured transport interval; not an inferred upstream phase."
            }
          }
        },
        "status": {
          "type": "string",
          "enum": [
            "prepared",
            "dispatching",
            "uncertain",
            "succeeded"
          ]
        },
        "created_at": {
          "type": "string",
          "format": "date-time"
        },
        "request_content_status": {
          "type": "string",
          "enum": [
            "retained",
            "deleted",
            "expired"
          ]
        },
        "request": {
          "type": [
            "object",
            "null"
          ],
          "additionalProperties": false,
          "required": [
            "name",
            "description"
          ],
          "properties": {
            "name": {
              "type": "string"
            },
            "description": {
              "type": [
                "string",
                "null"
              ]
            }
          }
        }
      }
    }
  }
}
```

### HTTP 401

Member or installation session required.

### HTTP 403

Workspace read permission required.

### HTTP 404

Workspace outside authorized scope.

## Behavior and supported scope

Requires workspace read permission. Returns null for absent intents. Expired or deleted request content is hidden immediately. Account bindings, credential revisions, fingerprints and procurement data are excluded.
