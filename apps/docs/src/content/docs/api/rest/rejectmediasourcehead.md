---
title: "Reject HEAD probes of image source capabilities"
description: "HEAD /v1/media/sources/{token}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`HEAD /v1/media/sources/{token}`

Always returns 405 without a response body. This handler does not authenticate, validate, claim or consume the path capability and does not access storage or return image metadata. HEAD cannot establish whether a source exists or is available. Only GET performs capability delivery checks. Capability tokens are secrets and must not be logged or disclosed. No bearer or workspace API key is required to receive this uniform refusal.

Operation: `rejectMediaSourceHead`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X HEAD "$NIU_ORIGIN/v1/media/sources/{token}"
```

## Parameters

### token

Location: **path**. **Required.** Opaque short-lived source capability; ignored by the HEAD refusal handler.

```json
{
  "type": "string"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 405

HEAD is deliberately unsupported; empty response body regardless of capability validity.

Response headers:

```json
{
  "Cache-Control": {
    "description": "no-store, max-age=0",
    "schema": {
      "type": "string",
      "enum": [
        "no-store, max-age=0"
      ]
    }
  },
  "Referrer-Policy": {
    "description": "no-referrer",
    "schema": {
      "type": "string",
      "enum": [
        "no-referrer"
      ]
    }
  },
  "X-Content-Type-Options": {
    "description": "nosniff",
    "schema": {
      "type": "string",
      "enum": [
        "nosniff"
      ]
    }
  },
  "Cross-Origin-Resource-Policy": {
    "description": "same-origin",
    "schema": {
      "type": "string",
      "enum": [
        "same-origin"
      ]
    }
  },
  "Content-Security-Policy": {
    "description": "default-src 'none'; sandbox",
    "schema": {
      "type": "string",
      "enum": [
        "default-src 'none'; sandbox"
      ]
    }
  }
}
```

## Behavior and supported scope

Always returns 405 without a response body. This handler does not authenticate, validate, claim or consume the path capability and does not access storage or return image metadata. HEAD cannot establish whether a source exists or is available. Only GET performs capability delivery checks. Capability tokens are secrets and must not be logged or disclosed. No bearer or workspace API key is required to receive this uniform refusal.

**Supported scope:** implemented
