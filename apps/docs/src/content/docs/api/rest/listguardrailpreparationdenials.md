---
title: "Read latest 100 workspace preparation refusals"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/guardrails/denials"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/guardrails/denials`

Workspace read access required. Safe immutable metadata for pre-dispatch model/Provider access, local input inspection, output configuration and external input detector refusals. No request content, matched patterns, detector responses, credentials or internal event/key identifiers. Does not cover dispatch-time races or post-dispatch output inspection. Latest 100 only, newest first; not a complete audit export. Policy names and revisions identify the saved decision. Cache-Control no-store. Inference credentials cannot read these diagnostics.

Operation: `listGuardrailPreparationDenials`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/guardrails/denials" \
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

Latest 100 preparation refusals

Response headers:

```json
{
  "Cache-Control": {
    "schema": {
      "type": "string",
      "const": "no-store"
    }
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
    "coverage": {
      "const": "latest_100_preparation_denials"
    },
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "required": [
          "stage",
          "outcome",
          "coverage",
          "enforcer_version",
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
            "const": "preparation"
          },
          "outcome": {
            "const": "blocked"
          },
          "coverage": {
            "enum": [
              "model_provider_access",
              "local_input",
              "output_configuration",
              "external_input"
            ]
          },
          "enforcer_version": {
            "enum": [
              "access-v1",
              "local-input-v1",
              "buffer-mode-v1",
              "external-input-v1"
            ]
          },
          "reason": {
            "enum": [
              "model_denied",
              "provider_denied",
              "unsupported_policy",
              "input_blocked",
              "input_unsupported",
              "input_resource_limit",
              "input_unavailable",
              "output_incompatible",
              "detector_blocked",
              "detector_unsupported",
              "detector_unavailable"
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
    }
  }
}
```

### HTTP 401

Invalid management credential; inference keys cannot read decisions

### HTTP 403

Workspace outside authorized scope

### HTTP 503

Durable storage unavailable

## Behavior and supported scope

Workspace read access required. Safe immutable metadata for pre-dispatch model/Provider access, local input inspection, output configuration and external input detector refusals. No request content, matched patterns, detector responses, credentials or internal event/key identifiers. Does not cover dispatch-time races or post-dispatch output inspection. Latest 100 only, newest first; not a complete audit export. Policy names and revisions identify the saved decision. Cache-Control no-store. Inference credentials cannot read these diagnostics.

**Supported scope:** implemented
