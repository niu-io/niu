---
title: "Preview explicitly consented workspace image processing"
description: "POST /api/v1/organizations/{organization}/projects/{project}/guardrails/image-detectors/{detector}/preview"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/projects/{project}/guardrails/image-detectors/{detector}/preview`

Workspace write access required. Sends the supplied inline PNG, JPEG or WebP image to a deployment-configured image detector only after workspace authorization, current explicit consent and declared-unmetered checks. Route request body limit is 2 MiB. Decode errors are 400; decode-worker busy/failure is 503. Inspection unavailability is a 200 indeterminate outcome. Does not save or activate a policy, grant dispatch access or integrate customer billing. Cache-Control: no-store.

Operation: `previewWorkspaceImageDetector`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/guardrails/image-detectors/{detector}/preview" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

### detector

Location: **path**. **Required.**

```json
{
  "type": "string"
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
    "consent",
    "image"
  ],
  "properties": {
    "consent": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "configuration_fingerprint",
        "consent_to_image_processing"
      ],
      "properties": {
        "configuration_fingerprint": {
          "type": "string"
        },
        "consent_to_image_processing": {
          "type": "boolean"
        }
      }
    },
    "image": {
      "type": "string",
      "description": "Inline data:image reference; bounded PNG, JPEG or WebP decoding."
    }
  }
}
```

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
    "outcome",
    "reason",
    "synthetic",
    "enforcement",
    "policy_activation"
  ],
  "properties": {
    "outcome": {
      "type": "string",
      "enum": [
        "clear",
        "matched",
        "indeterminate"
      ]
    },
    "reason": {
      "type": "string",
      "enum": [
        "inspected_image",
        "image_match",
        "inspection_unavailable"
      ]
    },
    "synthetic": {
      "type": "boolean",
      "enum": [
        true
      ]
    },
    "enforcement": {
      "type": "boolean",
      "enum": [
        false
      ]
    },
    "policy_activation": {
      "type": "boolean",
      "enum": [
        false
      ]
    }
  }
}
```

### HTTP 400

Malformed JSON, unknown fields, invalid content, oversized body or missing/stale explicit consent

### HTTP 401

Invalid management credential; inference credentials cannot access management endpoints

### HTTP 403

Insufficient workspace permission or installation administrator authorization

### HTTP 404

Workspace or configured detector not found

### HTTP 503

Authorization/storage unavailable or image decode workers unavailable

## Behavior and supported scope

Workspace write access required. Sends the supplied inline PNG, JPEG or WebP image to a deployment-configured image detector only after workspace authorization, current explicit consent and declared-unmetered checks. Route request body limit is 2 MiB. Decode errors are 400; decode-worker busy/failure is 503. Inspection unavailability is a 200 indeterminate outcome. Does not save or activate a policy, grant dispatch access or integrate customer billing. Cache-Control: no-store.

**Supported scope:** implemented
