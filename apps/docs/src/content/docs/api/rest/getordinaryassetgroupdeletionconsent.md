---
title: "Read safe local consent and outcome status"
description: "GET /api/v1/vendors/{id}/asset-management/group-deletion-consents/{consent}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/vendors/{id}/asset-management/group-deletion-consents/{consent}`

Platform administrator only. Scoped to the original workspace and Provider configuration. Returns no upstream identities, credentials, grant evidence or procurement data. Consent status alone is not current dispatch authorization. Claimed/outcome state takes precedence over later consent revocation or expiry. Does not query upstream. Cache-Control no-store.

Operation: `getOrdinaryAssetGroupDeletionConsent`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/vendors/{id}/asset-management/group-deletion-consents/{consent}" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  --url-query 'organization_id=<ORGANIZATION_ID>' \
  --url-query 'project_id=<PROJECT_ID>'
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

### consent

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### organization_id

Location: **query**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### project_id

Location: **query**. **Required.**

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

Saved local consent status.

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
        "status",
        "created_at",
        "expires_at",
        "reason",
        "duration_ms",
        "dispatch_available"
      ],
      "properties": {
        "status": {
          "type": "string",
          "enum": [
            "consented",
            "revoked",
            "expired",
            "unresolved",
            "acknowledged",
            "uncertain"
          ]
        },
        "created_at": {
          "type": "string",
          "format": "date-time"
        },
        "expires_at": {
          "type": "string",
          "format": "date-time"
        },
        "reason": {
          "type": [
            "string",
            "null"
          ],
          "enum": [
            "invalid_configuration",
            "destination_rejected",
            "unavailable",
            "transport",
            "timeout",
            "response_limit",
            "invalid_response",
            null
          ]
        },
        "duration_ms": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 0
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

Invalid scope.

### HTTP 401

Authentication required.

### HTTP 403

Platform administrator required.

### HTTP 404

Consent not found in the specified scope.

## Behavior and supported scope

Platform administrator only. Scoped to the original workspace and Provider configuration. Returns no upstream identities, credentials, grant evidence or procurement data. Consent status alone is not current dispatch authorization. Claimed/outcome state takes precedence over later consent revocation or expiry. Does not query upstream. Cache-Control no-store.
