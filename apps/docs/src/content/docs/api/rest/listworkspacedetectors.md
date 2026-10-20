---
title: "List authorized workspace text detector declarations"
description: "GET /api/v1/organizations/{organization}/projects/{project}/guardrails/detectors"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/guardrails/detectors`

Workspace read access required. Sorted by detector name; only deployment-authorized workspace detectors are returned. Declared processing conditions are not verified guarantees. No content is dispatched and no policy is activated. Cache-Control: no-store.

Operation: `listWorkspaceDetectors`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/guardrails/detectors" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
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
          "schema_version",
          "detector_revision",
          "configuration_fingerprint",
          "recipient",
          "region",
          "retention",
          "processing_guarantees",
          "content_sent",
          "credential_source",
          "timeout_ms",
          "concurrency",
          "max_text_bytes",
          "max_response_bytes",
          "external_charge",
          "customer_billing",
          "policy_activation",
          "detector"
        ],
        "properties": {
          "schema_version": {
            "type": "integer",
            "enum": [
              1
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
          "processing_guarantees": {
            "type": "string",
            "enum": [
              "declared_unverified"
            ]
          },
          "content_sent": {
            "type": "string",
            "enum": [
              "request_text_after_local_redaction"
            ]
          },
          "credential_source": {
            "type": "string",
            "enum": [
              "server_environment"
            ]
          },
          "timeout_ms": {
            "type": "integer"
          },
          "concurrency": {
            "type": "integer"
          },
          "max_text_bytes": {
            "type": "integer"
          },
          "max_response_bytes": {
            "type": "integer",
            "enum": [
              4096
            ]
          },
          "external_charge": {
            "type": "string",
            "enum": [
              "unknown",
              "declared_unmetered"
            ]
          },
          "customer_billing": {
            "type": "string",
            "enum": [
              "not_integrated"
            ]
          },
          "policy_activation": {
            "type": "boolean"
          },
          "detector": {
            "type": "string"
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

Workspace read access required. Sorted by detector name; only deployment-authorized workspace detectors are returned. Declared processing conditions are not verified guarantees. No content is dispatched and no policy is activated. Cache-Control: no-store.

**Supported scope:** implemented
