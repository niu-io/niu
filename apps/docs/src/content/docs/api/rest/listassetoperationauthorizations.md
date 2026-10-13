---
title: "List one account's qualification records"
description: "GET /admin/v1/vendors/{id}/asset-management/authorizations"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/vendors/{id}/asset-management/authorizations`

Platform administrator only. Administrative evidence references and account bindings must not appear in customer projections. Records remain visible after expiry or revocation; presence is not proof of current authorization. Cache-Control no-store.

Operation: `listAssetOperationAuthorizations`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/vendors/{id}/asset-management/authorizations" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
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

### after

Location: **query**. Optional.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 30
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Bounded records ordered by routing identifier, with a cursor when more exist.

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
          "organization_id",
          "project_id",
          "vendor_revision",
          "credential_revision",
          "operation",
          "rights_sha256",
          "protocol_sha256",
          "data_handling_sha256",
          "free_operation_sha256",
          "created_at",
          "expires_at",
          "revoked"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "organization_id": {
            "type": "string",
            "format": "uuid"
          },
          "project_id": {
            "type": "string",
            "format": "uuid"
          },
          "vendor_revision": {
            "type": "integer",
            "minimum": 1
          },
          "credential_revision": {
            "type": "integer",
            "minimum": 1
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
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "expires_at": {
            "type": "string",
            "format": "date-time"
          },
          "revoked": {
            "type": "boolean"
          }
        }
      }
    },
    "next_cursor": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    }
  }
}
```

### HTTP 400

Invalid limit or cursor.

### HTTP 401

Authentication required.

### HTTP 403

Platform administrator required.

## Behavior and supported scope

Platform administrator only. Administrative evidence references and account bindings must not appear in customer projections. Records remain visible after expiry or revocation; presence is not proof of current authorization. Cache-Control no-store.
