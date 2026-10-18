---
title: "Read latest 100 workspace input detector decisions"
description: "GET /api/v1/organizations/{organization}/projects/{project}/guardrails/detector-decisions"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/guardrails/detector-decisions`

Workspace read access required. Metadata only, newest first, including pre-admission decisions. No request text, detector response bodies, credentials or internal event identifiers. Latest 100 only; not a complete audit export. Cache-Control: no-store.

Operation: `listInputDetectorDecisions`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/guardrails/detector-decisions" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
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
    "data",
    "coverage"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "detector",
          "configuration_fingerprint",
          "stage",
          "coverage",
          "enforcer_version",
          "outcome",
          "reason",
          "elapsed_ms",
          "key_name",
          "workspace_revision",
          "key_policy_revision",
          "key_assignment_revision",
          "recorded_at"
        ],
        "properties": {
          "detector": {
            "type": "string"
          },
          "configuration_fingerprint": {
            "type": "string"
          },
          "stage": {
            "type": "string",
            "enum": [
              "input"
            ]
          },
          "coverage": {
            "type": "string",
            "enum": [
              "local_text"
            ]
          },
          "enforcer_version": {
            "type": "string",
            "enum": [
              "external-input-v1"
            ]
          },
          "outcome": {
            "type": "string",
            "enum": [
              "clear",
              "matched",
              "indeterminate"
            ]
          },
          "reason": {
            "type": "string"
          },
          "elapsed_ms": {
            "type": "number"
          },
          "key_name": {
            "type": "string"
          },
          "workspace_revision": {
            "type": [
              "integer",
              "null"
            ]
          },
          "key_policy_revision": {
            "type": [
              "integer",
              "null"
            ]
          },
          "key_assignment_revision": {
            "type": [
              "integer",
              "null"
            ]
          },
          "recorded_at": {
            "type": "string",
            "format": "date-time"
          }
        }
      }
    },
    "coverage": {
      "type": "string",
      "enum": [
        "latest_100_input_detector_decisions"
      ]
    }
  }
}
```

### HTTP 401

Invalid management credential; inference credentials cannot access management endpoints

### HTTP 403

Insufficient workspace permission or installation administrator authorization

### HTTP 503

Authorization/storage unavailable

## Behavior and supported scope

Workspace read access required. Metadata only, newest first, including pre-admission decisions. No request text, detector response bodies, credentials or internal event identifiers. Latest 100 only; not a complete audit export. Cache-Control: no-store.

**Supported scope:** implemented
