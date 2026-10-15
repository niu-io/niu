---
title: "Record administrator-reviewed ordinary asset qualification"
description: "POST /api/v1/vendors/{id}/asset-management/authorizations"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/vendors/{id}/asset-management/authorizations`

Platform administrator only. Binds the exact workspace, direct Beijing Ark configuration revision and asset credential revision. The four nonzero SHA-256 references identify reviewed rights, protocol, data-handling and free-operation evidence; they do not establish entitlement automatically. Validity is bounded to 90 days. CreateAsset requires separate ingestion review and does not establish processing consent or exact inspected-content binding. DeleteAssetGroup requires its own reviewed grant and never inherits creation/read/update rights; it does not establish destructive user consent. Does not send upstream requests or enable dispatch. Request body is limited to 16 KiB.

Operation: `createAssetOperationAuthorization`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/vendors/{id}/asset-management/authorizations" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN" \
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
    "vendor_revision",
    "credential_revision",
    "rights_sha256",
    "protocol_sha256",
    "data_handling_sha256",
    "free_operation_sha256",
    "valid_for_seconds"
  ],
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "CreateAssetGroup",
        "GetAssetGroup",
        "ListAssets",
        "GetAsset",
        "UpdateAssetGroup",
        "DeleteAssetGroup",
        "CreateAsset"
      ],
      "default": "CreateAssetGroup",
      "description": "Each operation requires separate reviewed evidence; omitted means CreateAssetGroup only."
    },
    "organization_id": {
      "type": "string",
      "format": "uuid"
    },
    "project_id": {
      "type": "string",
      "format": "uuid",
      "description": "Workspace routing identifier."
    },
    "vendor_revision": {
      "type": "integer",
      "minimum": 1
    },
    "credential_revision": {
      "type": "integer",
      "minimum": 1
    },
    "rights_sha256": {
      "type": "string",
      "pattern": "^[a-fA-F0-9]{64}$",
      "not": {
        "const": "0000000000000000000000000000000000000000000000000000000000000000"
      }
    },
    "protocol_sha256": {
      "type": "string",
      "pattern": "^[a-fA-F0-9]{64}$",
      "not": {
        "const": "0000000000000000000000000000000000000000000000000000000000000000"
      }
    },
    "data_handling_sha256": {
      "type": "string",
      "pattern": "^[a-fA-F0-9]{64}$",
      "not": {
        "const": "0000000000000000000000000000000000000000000000000000000000000000"
      }
    },
    "free_operation_sha256": {
      "type": "string",
      "pattern": "^[a-fA-F0-9]{64}$",
      "not": {
        "const": "0000000000000000000000000000000000000000000000000000000000000000"
      }
    },
    "valid_for_seconds": {
      "type": "integer",
      "minimum": 1,
      "maximum": 7776000
    }
  }
}
```

## Responses

### HTTP 201

Immutable qualification recorded.

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
        "id",
        "operation",
        "dispatch_available"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "operation": {
          "type": "string",
          "enum": [
            "CreateAssetGroup",
            "GetAssetGroup",
            "ListAssets",
            "GetAsset",
            "UpdateAssetGroup",
            "DeleteAssetGroup",
            "CreateAsset"
          ]
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

Invalid revisions, validity or evidence references.

### HTTP 401

Authentication required.

### HTTP 403

Platform administrator required.

### HTTP 404

Workspace does not belong to the specified organization.

### HTTP 409

Account revision changed, account is not direct Ark, or asset credentials are missing or revoked.

### HTTP 413

Request body exceeds 16 KiB.

### HTTP 422

Invalid request shape or unknown fields.

## Behavior and supported scope

Platform administrator only. Binds the exact workspace, direct Beijing Ark configuration revision and asset credential revision. The four nonzero SHA-256 references identify reviewed rights, protocol, data-handling and free-operation evidence; they do not establish entitlement automatically. Validity is bounded to 90 days. CreateAsset requires separate ingestion review and does not establish processing consent or exact inspected-content binding. DeleteAssetGroup requires its own reviewed grant and never inherits creation/read/update rights; it does not establish destructive user consent. Does not send upstream requests or enable dispatch. Request body is limited to 16 KiB.
