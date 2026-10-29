---
title: "List supported payment integrations"
description: "GET /api/v1/platform/payments/integrations"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/platform/payments/integrations`

Installation credential or an explicit platform-administrator grant required, independent of customer company role. Capability inventory is independent of merchant activation. checkout_enabled and enabled_methods describe locally configured checkout, not merchant approval, funding or verified settlement. Customer checkout additionally requires the matching company currency account. Returns no merchant identity, endpoint or credentials. Refunds means refund initiation; query recovery is limited to the declared scope.

Operation: `listPaymentIntegrations`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/platform/payments/integrations" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Supported integrations, not enabled customer checkout methods

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
        "additionalProperties": false,
        "required": [
          "id",
          "name",
          "configuration",
          "checkout",
          "signed_notifications",
          "query_recovery",
          "refunds",
          "checkout_enabled",
          "enabled_methods"
        ],
        "properties": {
          "id": {
            "type": "string",
            "enum": [
              "epay",
              "stripe",
              "zhifux"
            ]
          },
          "name": {
            "type": "string"
          },
          "configuration": {
            "type": "string",
            "enum": [
              "administration_api",
              "server_environment",
              "server_file"
            ]
          },
          "checkout": {
            "type": "boolean"
          },
          "signed_notifications": {
            "type": "boolean"
          },
          "query_recovery": {
            "type": "string",
            "enum": [
              "unsupported",
              "bound_session",
              "saved_order"
            ]
          },
          "refunds": {
            "type": "boolean"
          },
          "checkout_enabled": {
            "type": "boolean",
            "description": "A local checkout configuration is enabled; this does not certify merchant activation or actual payment."
          },
          "enabled_methods": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Configured method identifiers; empty when checkout is disabled. No company balance-account eligibility is implied."
          }
        }
      }
    }
  }
}
```

### HTTP 401

Authentication required

### HTTP 403

Platform administration authority required

## Behavior and supported scope

Installation credential or an explicit platform-administrator grant required, independent of customer company role. Capability inventory is independent of merchant activation. checkout_enabled and enabled_methods describe locally configured checkout, not merchant approval, funding or verified settlement. Customer checkout additionally requires the matching company currency account. Returns no merchant identity, endpoint or credentials. Refunds means refund initiation; query recovery is limited to the declared scope.

**Supported scope:** implemented
