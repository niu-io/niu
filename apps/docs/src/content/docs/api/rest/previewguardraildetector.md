---
title: "Preview installation text detector transport"
description: "POST /api/v1/guardrails/detectors/{detector}/preview"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/guardrails/detectors/{detector}/preview`

Installation administrator only. Explicit consent and the current configuration fingerprint are required before supplied synthetic text is sent to the configured external detector. Does not activate a detector or enforce a policy; no customer billing integration. A detector-unavailable result is a 200 indeterminate outcome, not proof of successful inspection. Cache-Control: no-store.

Operation: `previewGuardrailDetector`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/guardrails/detectors/{detector}/preview" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

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
    "configuration_fingerprint",
    "text",
    "consent_to_external_processing"
  ],
  "properties": {
    "configuration_fingerprint": {
      "type": "string"
    },
    "text": {
      "type": "string"
    },
    "consent_to_external_processing": {
      "type": "boolean"
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
    "enforcement"
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
      "type": "string"
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
    }
  }
}
```

### HTTP 400

Malformed JSON, unknown fields, invalid content or missing/stale explicit consent

### HTTP 401

Invalid management credential; inference credentials cannot access management endpoints

### HTTP 403

Insufficient workspace permission or installation administrator authorization

### HTTP 404

Configured detector not found

### HTTP 503

Authorization/storage unavailable

## Behavior and supported scope

Installation administrator only. Explicit consent and the current configuration fingerprint are required before supplied synthetic text is sent to the configured external detector. Does not activate a detector or enforce a policy; no customer billing integration. A detector-unavailable result is a 200 indeterminate outcome, not proof of successful inspection. Cache-Control: no-store.

**Supported scope:** implemented
