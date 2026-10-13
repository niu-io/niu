---
title: "List workspace-authorized media inspection configurations"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/guardrails/media-detectors"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/guardrails/media-detectors`

Returns only deployment-authorized audio/video configuration metadata for the requested workspace. Declared conditions and a fingerprint do not establish successful inspection or consent; policy activation and media task references remain unavailable. No service endpoint, credential, environment variable or foreign workspace configuration is exposed. This operation performs no external inspection.

Operation: `listWorkspaceMediaDetectors`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/guardrails/media-detectors" \
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

Declared workspace media processing conditions

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
          "detector_revision",
          "configuration_fingerprint",
          "recipient",
          "region",
          "retention",
          "schema_version",
          "kind",
          "content_sent",
          "processing_guarantees",
          "timeout_ms",
          "maximum_encoded_bytes",
          "concurrency",
          "declared_unmetered",
          "policy_activation",
          "requires_supported_presentation_facts"
        ],
        "properties": {
          "detector": {
            "type": "string"
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
          "schema_version": {
            "type": "integer",
            "enum": [
              3
            ]
          },
          "kind": {
            "type": "string",
            "enum": [
              "audio",
              "video"
            ]
          },
          "content_sent": {
            "type": "string",
            "enum": [
              "exact_encoded_media_with_embedded_tracks"
            ]
          },
          "processing_guarantees": {
            "type": "string",
            "enum": [
              "declared_unverified"
            ]
          },
          "timeout_ms": {
            "type": "integer",
            "minimum": 1,
            "maximum": 30000
          },
          "maximum_encoded_bytes": {
            "type": "integer",
            "minimum": 1,
            "maximum": 8388608
          },
          "concurrency": {
            "type": "integer",
            "minimum": 1,
            "maximum": 4
          },
          "declared_unmetered": {
            "type": "boolean"
          },
          "policy_activation": {
            "type": "boolean",
            "enum": [
              false
            ]
          },
          "requires_supported_presentation_facts": {
            "type": "boolean",
            "enum": [
              true
            ]
          }
        }
      }
    }
  }
}
```

### HTTP 401

Invalid management credential; inference keys cannot access this operation

### HTTP 403

Insufficient workspace permission

### HTTP 404

Workspace not found

### HTTP 503

Authorization or storage unavailable

## Behavior and supported scope

Returns only deployment-authorized audio/video configuration metadata for the requested workspace. Declared conditions and a fingerprint do not establish successful inspection or consent; policy activation and media task references remain unavailable. No service endpoint, credential, environment variable or foreign workspace configuration is exposed. This operation performs no external inspection.

**Supported scope:** implemented
