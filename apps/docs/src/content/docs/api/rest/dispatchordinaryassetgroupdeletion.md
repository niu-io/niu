---
title: "Dispatch one irreversible ordinary-group cascading deletion"
description: "POST /api/v1/vendors/{id}/asset-management/group-deletion-consents/{consent}/dispatch"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/vendors/{id}/asset-management/group-deletion-consents/{consent}/dispatch`

Platform administrator only. Requires separately saved explicit consent and a current exact DeleteAssetGroup grant. Rechecks original credential/configuration binding, expiry, revocation and mutation holds before committing a one-shot claim. Uses the fixed signed Ark endpoint without retries. A disconnected client does not cancel the bounded worker. Unacknowledged responses remain uncertain; neither outcome proves independent absence, releases the mutation fence or permits replay. No customer charge. Cache-Control no-store.

Operation: `dispatchOrdinaryAssetGroupDeletion`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/vendors/{id}/asset-management/group-deletion-consents/{consent}/dispatch" \
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

### consent

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
    "project_id"
  ],
  "properties": {
    "organization_id": {
      "type": "string",
      "format": "uuid"
    },
    "project_id": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

## Responses

### HTTP 200

Durable acknowledged or uncertain outcome; independent reconciliation remains required.

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
        "status",
        "reconciliation_required"
      ],
      "properties": {
        "consent_id": {
          "type": "string",
          "format": "uuid"
        },
        "status": {
          "type": "string",
          "enum": [
            "acknowledged",
            "uncertain"
          ]
        },
        "reconciliation_required": {
          "type": "boolean",
          "const": true
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

Consent does not belong to this workspace and Provider configuration.

### HTTP 409

Ineligible or consumed consent, stale qualification or outstanding mutation hold.

### HTTP 413

Request exceeds 4096 bytes.

### HTTP 422

Invalid shape or unknown fields.

### HTTP 503

Execution capacity, credential decryption or durable outcome unavailable. Read saved status; do not automatically retry.

## Behavior and supported scope

Platform administrator only. Requires separately saved explicit consent and a current exact DeleteAssetGroup grant. Rechecks original credential/configuration binding, expiry, revocation and mutation holds before committing a one-shot claim. Uses the fixed signed Ark endpoint without retries. A disconnected client does not cancel the bounded worker. Unacknowledged responses remain uncertain; neither outcome proves independent absence, releases the mutation fence or permits replay. No customer charge. Cache-Control no-store.
