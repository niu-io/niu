---
title: "List authorized workspace image detector declarations"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/guardrails/image-detectors"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/guardrails/image-detectors`

Workspace read access required. Separate image processing discovery, sorted by detector name. Declared processing conditions are not verified guarantees. No image dispatch or policy activation. Cache-Control: no-store.

Operation: `listWorkspaceImageDetectors`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  },
  {
    "niuApiKeyAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/guardrails/image-detectors" \
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

## Request body

No request body is declared.

## Responses

### HTTP 200

Declared metadata or synthetic result; Cache-Control: no-store

Response headers:

```json
{
  "Cache-Control": {
    "schema": {
      "type": "string"
    },
    "description": "no-store"
  }
}
```

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
        "required": [
          "detector",
          "schema_version",
          "detector_revision",
          "configuration_fingerprint",
          "recipient",
          "region",
          "retention",
          "content_sent",
          "processing_guarantees",
          "timeout_ms",
          "maximum_encoded_bytes",
          "maximum_width",
          "maximum_height",
          "maximum_decoded_bytes",
          "concurrency",
          "declared_unmetered",
          "policy_activation"
        ],
        "properties": {
          "detector": {
            "type": "string"
          },
          "schema_version": {
            "type": "integer",
            "enum": [
              2
            ]
          },
          "detector_revision": {
            "type": "string"
          },
          "configuration_fingerprint": {
            "type": "string"
          },
          "recipient": {
            "type": "string"
          },
          "region": {
            "type": "string"
          },
          "retention": {
            "type": "string"
          },
          "content_sent": {
            "type": "string",
            "enum": [
              "exact_encoded_image"
            ]
          },
          "processing_guarantees": {
            "type": "string",
            "enum": [
              "declared_unverified"
            ]
          },
          "timeout_ms": {
            "type": "integer"
          },
          "maximum_encoded_bytes": {
            "type": "integer"
          },
          "maximum_width": {
            "type": "integer"
          },
          "maximum_height": {
            "type": "integer"
          },
          "maximum_decoded_bytes": {
            "type": "integer"
          },
          "concurrency": {
            "type": "integer"
          },
          "declared_unmetered": {
            "type": "boolean"
          },
          "policy_activation": {
            "type": "boolean",
            "enum": [
              false
            ]
          }
        }
      }
    }
  }
}
```

### HTTP 401

Invalid management credential; inference credentials cannot access management endpoints

### HTTP 403

Insufficient workspace permission or installation administrator authorization

### HTTP 404

Workspace or configured detector not found

### HTTP 503

Authorization/storage unavailable

## Behavior and supported scope

Workspace read access required. Separate image processing discovery, sorted by detector name. Declared processing conditions are not verified guarantees. No image dispatch or policy activation. Cache-Control: no-store.

**Supported scope:** implemented
