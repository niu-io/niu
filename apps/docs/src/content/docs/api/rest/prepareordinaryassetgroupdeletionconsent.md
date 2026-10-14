---
title: "Record specific cascading-deletion consent without dispatch"
description: "POST /admin/v1/vendors/{id}/asset-management/group-deletion-consents"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/vendors/{id}/asset-management/group-deletion-consents`

Platform administrator only. Requires explicit irreversible cascading confirmation for a successful saved ordinary group and its exact current DeleteAssetGroup qualification. Consent is immutable, actor-bound and limited to 900 seconds or the grant expiry, whichever is earlier. Identical replay does not renew expiry; changed, expired or revoked consent conflicts. No upstream deletion, credential release or billing mutation. Body is limited to 4096 bytes.

Operation: `prepareOrdinaryAssetGroupDeletionConsent`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/vendors/{id}/asset-management/group-deletion-consents" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "organization_id",
    "project_id",
    "intent_id",
    "consent_id",
    "authorization_id",
    "valid_for_seconds",
    "confirm_cascade"
  ],
  "properties": {
    "organization_id": {
      "type": "string",
      "format": "uuid"
    },
    "project_id": {
      "type": "string",
      "format": "uuid"
    },
    "intent_id": {
      "type": "string",
      "format": "uuid"
    },
    "consent_id": {
      "type": "string",
      "format": "uuid"
    },
    "authorization_id": {
      "type": "string",
      "format": "uuid"
    },
    "valid_for_seconds": {
      "type": "integer",
      "minimum": 1,
      "maximum": 900
    },
    "confirm_cascade": {
      "type": "boolean",
      "const": true
    }
  }
}
```

## Responses

### HTTP 200

Identical unexpired consent retained without renewal.

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
        "consent_id",
        "prepared",
        "dispatch_available"
      ],
      "properties": {
        "consent_id": {
          "type": "string",
          "format": "uuid"
        },
        "prepared": {
          "type": "boolean",
          "const": true
        },
        "dispatch_available": {
          "type": "boolean",
          "const": false
        }
      }
    }
  }
}
```

### HTTP 201

Consent recorded; no upstream dispatch.

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
        "consent_id",
        "prepared",
        "dispatch_available"
      ],
      "properties": {
        "consent_id": {
          "type": "string",
          "format": "uuid"
        },
        "prepared": {
          "type": "boolean",
          "const": true
        },
        "dispatch_available": {
          "type": "boolean",
          "const": false
        }
      }
    }
  }
}
```

### HTTP 400

Cascading confirmation missing or validity outside bounds.

### HTTP 401

Authentication required.

### HTTP 403

Platform administrator required.

### HTTP 404

Original group not found in the specified workspace and Provider configuration.

### HTTP 409

Group or qualification unavailable, stale binding, or conflicting/expired/revoked consent.

### HTTP 413

Request exceeds 4096 bytes.

### HTTP 422

Invalid request shape or unknown fields.

## Behavior and supported scope

Platform administrator only. Requires explicit irreversible cascading confirmation for a successful saved ordinary group and its exact current DeleteAssetGroup qualification. Consent is immutable, actor-bound and limited to 900 seconds or the grant expiry, whichever is earlier. Identical replay does not renew expiry; changed, expired or revoked consent conflicts. No upstream deletion, credential release or billing mutation. Body is limited to 4096 bytes.
