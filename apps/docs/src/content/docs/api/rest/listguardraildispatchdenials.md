---
title: "Read latest 100 workspace dispatch policy exceptions"
description: "GET /api/v1/organizations/{organization}/projects/{project}/guardrails/dispatch-denials"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/guardrails/dispatch-denials`

Workspace read access required. Metadata only, newest first, combining dispatch and batch-admission policy rejections. Eligibility/status denials are outside this coverage. No request content, credentials or internal event identifiers. Latest 100 only; not a complete audit export. Cache-Control: no-store.

Operation: `listGuardrailDispatchDenials`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/guardrails/dispatch-denials" \
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
          "stage",
          "outcome",
          "coverage",
          "reason",
          "key_name",
          "workspace_policy_name",
          "key_policy_name",
          "workspace_revision",
          "key_policy_revision",
          "key_assignment_revision",
          "recorded_at"
        ],
        "properties": {
          "stage": {
            "type": "string",
            "enum": [
              "dispatch",
              "batch_admission"
            ]
          },
          "outcome": {
            "type": "string",
            "enum": [
              "blocked"
            ]
          },
          "coverage": {
            "type": "string",
            "enum": [
              "model_provider_access",
              "policy_binding"
            ]
          },
          "reason": {
            "type": "string",
            "enum": [
              "access_denied",
              "input_binding_missing",
              "policy_changed"
            ]
          },
          "key_name": {
            "type": "string"
          },
          "workspace_policy_name": {
            "type": [
              "string",
              "null"
            ]
          },
          "key_policy_name": {
            "type": [
              "string",
              "null"
            ]
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
        "latest_100_dispatch_policy_exceptions"
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

Workspace read access required. Metadata only, newest first, combining dispatch and batch-admission policy rejections. Eligibility/status denials are outside this coverage. No request content, credentials or internal event identifiers. Latest 100 only; not a complete audit export. Cache-Control: no-store.

**Supported scope:** implemented
