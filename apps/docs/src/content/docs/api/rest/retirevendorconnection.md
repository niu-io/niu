---
title: "Retire a Provider API-key connection without deleting history"
description: "POST /api/v1/vendors/{id}/retire"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/vendors/{id}/retire`

Platform administration required. Disables the connection and every model binding, erases the stored credential and appends an immutable retirement audit event. Existing offers, requests, earnings, incidents and audit history are retained; in-flight attempts keep their pinned configuration, while new dispatch is blocked. Idempotent for an already retired connection. Not a hard delete.

Operation: `retireVendorConnection`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/vendors/{id}/retire" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### id

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

Retired connection wrapped in data.

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
      "additionalProperties": false,
      "required": [
        "id",
        "name",
        "adapter",
        "api_base",
        "enabled",
        "revision",
        "has_credential"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "name": {
          "type": "string"
        },
        "adapter": {
          "type": "string",
          "enum": [
            "openrouter",
            "openai",
            "anthropic",
            "gemini",
            "ark"
          ]
        },
        "api_base": {
          "type": "string",
          "format": "uri"
        },
        "enabled": {
          "type": "boolean"
        },
        "revision": {
          "type": "integer",
          "minimum": 1
        },
        "has_credential": {
          "type": "boolean"
        },
        "owner_funded": {
          "type": "boolean",
          "readOnly": true,
          "description": "Configuration-list metadata identifying a credential paid directly by one account. Not accepted in configuration writes."
        },
        "access_scope": {
          "type": "string",
          "enum": [
            "commercial",
            "personal",
            "internal"
          ],
          "readOnly": true,
          "description": "Effective credential access scope. commercial is shared commercial supply; personal is restricted to its funding account; internal is an owner-funded credential shared with every organization while Internal use is active and restricted to its funding account in Resale."
        },
        "supplier": {
          "type": [
            "object",
            "null"
          ],
          "description": "Provider ownership on configuration-list reads; credentials and commercial data are excluded.",
          "required": [
            "id",
            "name"
          ],
          "additionalProperties": false,
          "properties": {
            "id": {
              "type": "string",
              "format": "uuid"
            },
            "name": {
              "type": "string"
            }
          }
        }
      }
    }
  }
}
```

### HTTP 401

Invalid or expired administrative credential.

### HTTP 403

Platform administration permission required.

### HTTP 404

Vendor does not exist.

## Behavior and supported scope

Platform administration required. Disables the connection and every model binding, erases the stored credential and appends an immutable retirement audit event. Existing offers, requests, earnings, incidents and audit history are retained; in-flight attempts keep their pinned configuration, while new dispatch is blocked. Idempotent for an already retired connection. Not a hard delete.

**Supported scope:** implemented
