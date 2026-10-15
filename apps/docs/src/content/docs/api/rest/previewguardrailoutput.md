---
title: "Test synthetic output against local text rules without enforcement"
description: "POST /api/v1/organizations/{organization}/projects/{project}/guardrails/output-preview"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/projects/{project}/guardrails/output-preview`

Requires workspace read permission. Does not save content or policy, create requests, or call inference/detector services. Returns safe outcome codes only, with no original, transformed or matched text. Does not validate route availability or activate content controls. Responses use Cache-Control no-store. The complete synthetic request envelope is limited to 1 MiB. Uses the live buffered-full local output inspector, with a 1 MiB serialized-response and transformed-response limit; unsupported/opaque/tool content is indeterminate. This does not qualify streaming inspection or external detectors. Local tests use at most four blocking workers per gateway process with no waiting queue and a five-second response deadline; cancellation does not release a slot until computation finishes.

Operation: `previewGuardrailOutput`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/guardrails/output-preview" \
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "protocol",
    "rules",
    "response"
  ],
  "properties": {
    "mode": {
      "type": "string",
      "enum": [
        "buffered_full",
        "observe_only"
      ],
      "default": "buffered_full"
    },
    "protocol": {
      "type": "string",
      "enum": [
        "chat",
        "responses"
      ]
    },
    "response": {
      "description": "Synthetic complete protocol response to inspect."
    },
    "rules": {
      "type": "array",
      "minItems": 1,
      "maxItems": 32,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "action"
        ],
        "oneOf": [
          {
            "required": [
              "pattern"
            ],
            "not": {
              "required": [
                "preset"
              ]
            }
          },
          {
            "required": [
              "preset"
            ],
            "not": {
              "required": [
                "pattern"
              ]
            }
          }
        ],
        "properties": {
          "pattern": {
            "type": "string",
            "minLength": 1,
            "description": "Regex limited to 4096 UTF-8 bytes and bounded compiled size."
          },
          "preset": {
            "type": "string",
            "enum": [
              "email_v1",
              "api_key_prefix_v1"
            ],
            "description": "Versioned syntax patterns; not universal PII or secret detection."
          },
          "action": {
            "type": "string",
            "enum": [
              "block",
              "redact"
            ]
          }
        }
      }
    }
  }
}
```

## Responses

### HTTP 200

Synthetic inspection outcome; unsupported content and resource limits are indeterminate.

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "outcome",
    "reason",
    "redacted",
    "synthetic",
    "enforcement",
    "mode",
    "coverage"
  ],
  "properties": {
    "outcome": {
      "type": "string",
      "enum": [
        "allowed",
        "blocked",
        "clear",
        "matched",
        "indeterminate"
      ]
    },
    "reason": {
      "type": "string",
      "enum": [
        "inspected_text",
        "pattern_denial",
        "pattern_match",
        "unsupported_content",
        "resource_limit",
        "invalid_pattern"
      ]
    },
    "redacted": {
      "type": "boolean"
    },
    "synthetic": {
      "const": true
    },
    "enforcement": {
      "const": false
    },
    "mode": {
      "enum": [
        "buffered_full",
        "observe_only"
      ]
    },
    "coverage": {
      "const": "local_text"
    }
  }
}
```

### HTTP 400

Invalid JSON shape, enum value or oversized/invalid rule set. Errors do not echo submitted content.

### HTTP 401

Authentication required.

### HTTP 403

Workspace read access required.

### HTTP 503

Inspection capacity unavailable, worker failure or response deadline exceeded. No inference is dispatched.

## Behavior and supported scope

Requires workspace read permission. Does not save content or policy, create requests, or call inference/detector services. Returns safe outcome codes only, with no original, transformed or matched text. Does not validate route availability or activate content controls. Responses use Cache-Control no-store. The complete synthetic request envelope is limited to 1 MiB. Uses the live buffered-full local output inspector, with a 1 MiB serialized-response and transformed-response limit; unsupported/opaque/tool content is indeterminate. This does not qualify streaming inspection or external detectors. Local tests use at most four blocking workers per gateway process with no waiting queue and a five-second response deadline; cancellation does not release a slot until computation finishes.
