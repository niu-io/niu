---
title: "Read installation text detector processing declaration"
description: "GET /api/v1/guardrails/detectors/{detector}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/guardrails/detectors/{detector}`

Installation administrator only; workspace-scoped management credentials are forbidden. Returns declared processing conditions for reviewing explicit synthetic-test consent. Does not send content. Declarations are not verified processing guarantees. Cache-Control: no-store.

Operation: `getGuardrailDetectorDescription`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/guardrails/detectors/{detector}" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
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
    "policy_activation"
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
        "synthetic_text"
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
    }
  }
}
```

### HTTP 401

Invalid management credential; inference credentials cannot access management endpoints

### HTTP 403

Insufficient workspace permission or installation administrator authorization

### HTTP 404

Configured detector not found

### HTTP 503

Authorization/storage unavailable

## Behavior and supported scope

Installation administrator only; workspace-scoped management credentials are forbidden. Returns declared processing conditions for reviewing explicit synthetic-test consent. Does not send content. Declarations are not verified processing guarantees. Cache-Control: no-store.

**Supported scope:** implemented
