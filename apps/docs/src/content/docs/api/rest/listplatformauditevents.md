---
title: "List platform operation audit logs"
description: "GET /api/v1/platform/audit-events"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/platform/audit-events`

Platform administrators only. Aggregates saved operator, Provider configuration, Provider, branding, payment gateway and platform-access journals. Metadata only: no credentials, configuration values, request content or procurement prices. password_login_succeeded records verified password login; session_created records session issuance and does not prove login. Historical actor attribution may be unknown, and displayed names are current names. No historical completeness or failed-login coverage is asserted. Source-qualified keyset pagination orders newest first, using source and event ID for ties. Changing category requires restarting without a cursor. Successful responses are not cached. Includes immutable standard-price/promotion changes, text/media workspace enrollment, noncash grants and route media-liability qualification. Publishes and exact idempotent retries share the same saved event; no history is fabricated. Freeform reasons, quantities, schedules, balances and monetary values are not returned. New commercial sources remain platform-only; a cursor from another category is rejected.

Operation: `listPlatformAuditEvents`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/platform/audit-events" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
```

## Parameters

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 50
}
```

### cursor

Location: **query**. Optional. Opaque source-qualified next_cursor from the previous page; do not parse or display.

```json
{
  "type": "string",
  "maxLength": 100
}
```

### category

Location: **query**. Optional.

```json
{
  "type": "string",
  "enum": [
    "authentication",
    "configuration",
    "access",
    "supplier"
  ]
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Saved operation metadata and a nullable continuation cursor.

Response headers:

```json
{
  "Cache-Control": {
    "schema": {
      "type": "string",
      "const": "no-store"
    }
  }
}
```

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_cursor"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "source",
          "category",
          "action",
          "actor_kind",
          "actor_label",
          "target_label",
          "created_at",
          "revision",
          "before_role",
          "after_role"
        ],
        "properties": {
          "id": {
            "type": "string",
            "description": "Internal source-qualified event reference. Never render as a display label."
          },
          "source": {
            "type": "string",
            "enum": [
              "operator",
              "vendor",
              "supplier",
              "branding",
              "payment_gateway",
              "platform_access",
              "retail_price",
              "retail_text_enrollment",
              "retail_media_enrollment",
              "balance_grant",
              "credit_policy",
              "grant_preparation",
              "media_liability",
              "procurement_configuration"
            ]
          },
          "category": {
            "type": "string",
            "enum": [
              "authentication",
              "configuration",
              "access",
              "supplier"
            ]
          },
          "action": {
            "type": "string"
          },
          "actor_kind": {
            "type": "string"
          },
          "actor_label": {
            "type": "string",
            "description": "Recorded name or recorded system role; Unknown actor when historical attribution is absent. Labels are current names, not historical name snapshots."
          },
          "target_label": {
            "type": "string"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "revision": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[1-9][0-9]*$",
            "description": "Decimal revision string, when present. No configuration values are included."
          },
          "before_role": {
            "type": [
              "string",
              "null"
            ],
            "enum": [
              "owner",
              "admin",
              "viewer",
              null
            ],
            "description": "Recorded role before a future role_changed event; null for historical events and other journal streams."
          },
          "after_role": {
            "type": [
              "string",
              "null"
            ],
            "enum": [
              "owner",
              "admin",
              "viewer",
              null
            ],
            "description": "Recorded role after the same mutation; never inferred from current user metadata."
          }
        }
      }
    },
    "next_cursor": {
      "type": [
        "string",
        "null"
      ],
      "description": "Opaque cursor, null on the final page."
    }
  }
}
```

### HTTP 400

Unknown query field, invalid category, page size or cursor, or cursor from a different category.

### HTTP 401

Missing or invalid administrator authentication.

### HTTP 403

Authenticated caller lacks platform administrator access. Workspace and Provider roles do not grant access.

### HTTP 503

Durable storage unavailable.

## Behavior and supported scope

Platform administrators only. Aggregates saved operator, Provider configuration, Provider, branding, payment gateway and platform-access journals. Metadata only: no credentials, configuration values, request content or procurement prices. password_login_succeeded records verified password login; session_created records session issuance and does not prove login. Historical actor attribution may be unknown, and displayed names are current names. No historical completeness or failed-login coverage is asserted. Source-qualified keyset pagination orders newest first, using source and event ID for ties. Changing category requires restarting without a cursor. Successful responses are not cached. Includes immutable standard-price/promotion changes, text/media workspace enrollment, noncash grants and route media-liability qualification. Publishes and exact idempotent retries share the same saved event; no history is fabricated. Freeform reasons, quantities, schedules, balances and monetary values are not returned. New commercial sources remain platform-only; a cursor from another category is rejected.

**Supported scope:** implemented
