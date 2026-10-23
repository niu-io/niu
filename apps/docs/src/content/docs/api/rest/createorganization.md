---
title: "Create a company and its initial zero-funded account"
description: "POST /api/v1/organizations"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations`

Installation administrator only. Atomically creates the company and an initial account in the configured platform currency (USD for legacy installations before currency setup), with zero funding and zero approved credit. No payment or funding receipt is recorded. Paid admission still requires permitted capacity and customer pricing. Name is validated but preserved without trimming. Additional currencies need explicit account setup; no currency conversion is implied. Optional Idempotency-Key is durable in one installation-wide namespace, separate from workspace creation. Repeating the same name and resolved currency returns the original company identity and current name with 201; different input returns 409. A deleted company returns 404 without recreation. Without the header each successful call creates a company. On uncertain outcomes retry the same key and input.

Operation: `createOrganization`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### Idempotency-Key

Location: **header**. Optional. Exactly one visible-ASCII identity; preserve it with the original input when retrying.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 128,
  "pattern": "^[!-~]+$"
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
    "name"
  ],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200,
      "description": "Must contain non-whitespace text and fit within 200 UTF-8 bytes."
    },
    "currency": {
      "type": "string",
      "pattern": "^[A-Z]{3}$",
      "default": "USD"
    }
  }
}
```

## Responses

### HTTP 201

Company identity and initial account currency.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "id",
    "name",
    "currency"
  ],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "name": {
      "type": "string"
    },
    "currency": {
      "type": "string",
      "pattern": "^[A-Z]{3}$"
    }
  }
}
```

### HTTP 400

Invalid name/currency, malformed JSON syntax, or invalid/repeated Idempotency-Key header.

### HTTP 401

Missing, invalid, expired or revoked management credential.

### HTTP 403

Installation administrator required; company/workspace members cannot create companies.

### HTTP 404

The company from the original idempotent creation was deleted.

### HTTP 409

Idempotency-Key was already used with a different name or currency.

### HTTP 422

Missing required field, unknown field, or invalid JSON field type.

### HTTP 503

Storage unavailable; creation outcome may be uncertain.

## Behavior and supported scope

Installation administrator only. Atomically creates the company and an initial account in the configured platform currency (USD for legacy installations before currency setup), with zero funding and zero approved credit. No payment or funding receipt is recorded. Paid admission still requires permitted capacity and customer pricing. Name is validated but preserved without trimming. Additional currencies need explicit account setup; no currency conversion is implied. Optional Idempotency-Key is durable in one installation-wide namespace, separate from workspace creation. Repeating the same name and resolved currency returns the original company identity and current name with 201; different input returns 409. A deleted company returns 404 without recreation. Without the header each successful call creates a company. On uncertain outcomes retry the same key and input.

**Supported scope:** implemented
